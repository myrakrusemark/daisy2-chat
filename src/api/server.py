"""FastAPI server for web-based Claude assistant"""

import os
import logging
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .session_manager import SessionManager
from .websocket_handler import WebSocketHandler
from .models import SessionCreate, SessionInfo, ConfigUpdate, ConversationHistory

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
log = logging.getLogger(__name__)

# Get project root
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Initialize session manager
session_manager: Optional[SessionManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    global session_manager

    # Startup
    max_sessions = int(os.getenv("MAX_SESSIONS", "10"))
    session_timeout = int(os.getenv("SESSION_TIMEOUT", "3600"))
    session_manager = SessionManager(max_sessions=max_sessions, session_timeout=session_timeout)
    log.info(f"Session manager initialized (max_sessions: {max_sessions}, timeout: {session_timeout}s)")

    yield

    # Shutdown
    log.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Claude Assistant API",
    description="Web-based voice assistant powered by Claude Code",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
web_dir = PROJECT_ROOT / "web"
if web_dir.exists():
    app.mount("/static", StaticFiles(directory=str(web_dir / "static")), name="static")


# Routes

@app.get("/")
async def root():
    """Serve main web interface"""
    index_path = web_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Claude Assistant API", "docs": "/docs"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "active_sessions": len(session_manager.sessions) if session_manager else 0
    }


@app.post("/api/sessions", response_model=SessionInfo)
async def create_session(session_create: SessionCreate):
    """Create a new session"""
    try:
        # Validate working directory if provided
        working_dir = None
        if session_create.working_directory:
            working_dir = Path(session_create.working_directory)
            # Security: validate path is within allowed directories
            allowed_paths = os.getenv("ALLOWED_WORKSPACE_PATHS", "/app/sandbox,/app/data/custom").split(",")
            if not any(str(working_dir).startswith(allowed) for allowed in allowed_paths):
                raise HTTPException(status_code=400, detail="Working directory not allowed")

        session = session_manager.create_session(
            working_directory=working_dir,
            tool_profile=session_create.tool_profile,
            allowed_tools=session_create.allowed_tools,
            permission_mode=session_create.permission_mode,
        )

        return SessionInfo(
            session_id=session.session_id,
            working_directory=str(session.config.working_directory),
            conversation_id=session.conversation.conversation_id,
            tool_profile=session_create.tool_profile or "coding",
            allowed_tools=session.config.claude.allowed_tools,
            permission_mode=session.config.claude.permission_mode,
            created_at=session.created_at,
            last_activity=session.last_activity,
        )

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        log.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions")
async def list_sessions():
    """List all active sessions"""
    return {"sessions": session_manager.list_sessions()}


@app.get("/api/sessions/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str):
    """Get session information"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionInfo(
        session_id=session.session_id,
        working_directory=str(session.config.working_directory),
        conversation_id=session.conversation.conversation_id,
        tool_profile=session.config.claude.permission_mode,
        allowed_tools=session.config.claude.allowed_tools,
        permission_mode=session.config.claude.permission_mode,
        created_at=session.created_at,
        last_activity=session.last_activity,
    )


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session"""
    success = session_manager.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}


@app.get("/api/conversations/{conversation_id}", response_model=ConversationHistory)
async def get_conversation_history(conversation_id: str, limit: Optional[int] = None):
    """Get conversation history"""
    # Find session with matching conversation ID
    session = None
    for s in session_manager.sessions.values():
        if s.conversation.conversation_id == conversation_id:
            session = s
            break

    if not session:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = session.conversation.history
    if limit:
        messages = messages[-limit:]

    return ConversationHistory(
        conversation_id=conversation_id,
        messages=messages,
        message_count=len(session.conversation.history),
    )


@app.post("/api/sessions/{session_id}/config")
async def update_session_config(session_id: str, config_update: ConfigUpdate):
    """Update session configuration"""
    # Validate working directory if provided
    working_dir = None
    if config_update.working_directory:
        working_dir = Path(config_update.working_directory)
        allowed_paths = os.getenv("ALLOWED_WORKSPACE_PATHS", "/app/sandbox,/app/data/custom").split(",")
        if not any(str(working_dir).startswith(allowed) for allowed in allowed_paths):
            raise HTTPException(status_code=400, detail="Working directory not allowed")

    success = session_manager.update_session_config(
        session_id=session_id,
        working_directory=working_dir,
        allowed_tools=config_update.allowed_tools,
        permission_mode=config_update.permission_mode,
    )

    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"message": "Configuration updated"}


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time communication"""
    # Accept connection
    await websocket.accept()
    log.info(f"WebSocket connected for session {session_id}")

    # Get session
    session = session_manager.get_session(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    # Attach websocket to session
    session.websocket = websocket

    # Create handler
    handler = WebSocketHandler(websocket, session)

    try:
        # Start listening for messages
        await handler.listen()

    except WebSocketDisconnect:
        log.info(f"WebSocket disconnected for session {session_id}")

    except Exception as e:
        log.error(f"WebSocket error for session {session_id}: {e}")

    finally:
        # Detach websocket
        session.websocket = None


def main():
    """Run the server"""
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    log.info(f"Starting server on {host}:{port}")

    uvicorn.run(
        "api.server:app",
        host=host,
        port=port,
        reload=os.getenv("RELOAD", "false").lower() == "true",
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )


if __name__ == "__main__":
    main()
