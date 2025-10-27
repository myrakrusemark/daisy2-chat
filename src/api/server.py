"""FastAPI server for web-based Claude assistant"""

import os
import logging
import zipfile
import tempfile
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from .session_manager import SessionManager
from .websocket_handler import WebSocketHandler
from .models import (
    SessionCreate, SessionInfo, ConfigUpdate, ConversationHistory,
    DownloadLinkRequest, DownloadLinkResponse
)
from .download_manager import DownloadTokenManager

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
log = logging.getLogger(__name__)

# Get project root
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Initialize managers
session_manager: Optional[SessionManager] = None
download_manager: Optional[DownloadTokenManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    global session_manager, download_manager

    # Startup
    max_sessions = int(os.getenv("MAX_SESSIONS", "10"))
    session_timeout = int(os.getenv("SESSION_TIMEOUT", "3600"))
    session_manager = SessionManager(max_sessions=max_sessions, session_timeout=session_timeout)
    log.info(f"Session manager initialized (max_sessions: {max_sessions}, timeout: {session_timeout}s)")

    # Initialize download manager
    download_manager = DownloadTokenManager()
    await download_manager.start_cleanup_task()
    log.info("Download manager initialized")

    yield

    # Shutdown
    log.info("Shutting down...")
    if download_manager:
        await download_manager.stop_cleanup_task()


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

        session = await session_manager.create_session(
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
            allowed_tools=session.config.allowed_tools,
            permission_mode=session.config.permission_mode,
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
        tool_profile=session.config.permission_mode,
        allowed_tools=session.config.allowed_tools,
        permission_mode=session.config.permission_mode,
        created_at=session.created_at,
        last_activity=session.last_activity,
    )


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session"""
    success = await session_manager.delete_session(session_id)
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

    success = await session_manager.update_session_config(
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


@app.post("/api/download/generate", response_model=DownloadLinkResponse)
async def generate_download_link(request: DownloadLinkRequest):
    """
    Generate a temporary download link for a file or directory

    Args:
        request: Download link request

    Returns:
        Download link response with token and URL
    """
    # Get session
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get base URL
    base_url = os.getenv("BASE_URL", "http://localhost:8000")

    # Create token
    token = download_manager.create_token(
        file_path=request.file_path,
        session_id=request.session_id,
        session_working_dir=session.config.working_directory,
        expiry_minutes=request.expiry_minutes,
    )

    if not token:
        raise HTTPException(
            status_code=400,
            detail=f"Could not create download link. Please verify:\n"
                   f"1. Path exists: {request.file_path}\n"
                   f"2. Path is within working directory: {session.config.working_directory}\n"
                   f"3. File/directory size is within limits (100MB)"
        )

    # Get token info for response
    from datetime import datetime, timedelta
    expires_at = datetime.now() + timedelta(minutes=request.expiry_minutes)

    # Check file type
    full_path = Path(request.file_path)
    if not full_path.is_absolute():
        full_path = session.config.working_directory / request.file_path

    file_type = "directory (will be zipped)" if full_path.is_dir() else "file"
    download_url = f"{base_url}/api/download/{token}"

    message = f"Download link generated successfully!\n\n" \
              f"URL: {download_url}\n" \
              f"Type: {file_type}\n" \
              f"Expires: {request.expiry_minutes} minute{'s' if request.expiry_minutes != 1 else ''}\n" \
              f"Note: This is a single-use link that will be invalidated after download."

    return DownloadLinkResponse(
        token=token,
        download_url=download_url,
        expires_at=expires_at.isoformat(),
        file_type=file_type,
        message=message,
    )


@app.get("/api/download/stats")
async def get_download_stats(session_id: Optional[str] = None):
    """
    Get download token statistics

    Args:
        session_id: Optional session ID to filter by

    Returns:
        Statistics about download tokens
    """
    stats = download_manager.get_stats()

    if session_id:
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        return {
            "session_id": session_id,
            "working_directory": str(session.config.working_directory),
            "statistics": stats
        }

    return {"statistics": stats}


@app.get("/api/download/{token}")
async def download_file(token: str):
    """
    Download a file or directory using a temporary token

    Args:
        token: Download token

    Returns:
        File download or zip archive for directories
    """
    # Validate token and get file info
    token_info = download_manager.get_token_info(token)

    if not token_info:
        raise HTTPException(
            status_code=404,
            detail="Download link not found, expired, or already used"
        )

    file_path, session_id, is_directory = token_info

    # Verify file still exists
    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="File no longer exists"
        )

    try:
        if is_directory:
            # Create zip file for directory
            return await _serve_directory_as_zip(file_path)
        else:
            # Serve single file
            return FileResponse(
                path=file_path,
                filename=file_path.name,
                media_type="application/octet-stream",
            )

    except Exception as e:
        log.error(f"Error serving download for token {token}: {e}")
        raise HTTPException(status_code=500, detail="Error serving file")


async def _serve_directory_as_zip(directory: Path) -> StreamingResponse:
    """
    Create a zip archive of a directory and serve it

    Args:
        directory: Directory path to zip

    Returns:
        StreamingResponse with zip file
    """
    # Create temporary zip file
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    temp_zip_path = Path(temp_zip.name)
    temp_zip.close()

    try:
        # Create zip archive
        with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Walk through directory
            for file_path in directory.rglob('*'):
                if file_path.is_file():
                    # Add file to zip with relative path
                    arcname = file_path.relative_to(directory)
                    zipf.write(file_path, arcname)

        # Create streaming response
        def iterfile():
            with open(temp_zip_path, 'rb') as f:
                yield from f
            # Clean up temp file after streaming
            temp_zip_path.unlink()

        return StreamingResponse(
            iterfile(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={directory.name}.zip"
            }
        )

    except Exception as e:
        # Clean up temp file on error
        if temp_zip_path.exists():
            temp_zip_path.unlink()
        raise e


def main():
    """Run the server"""
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    log.info(f"Starting server on {host}:{port}")

    uvicorn.run(
        "src.api.server:app",
        host=host,
        port=port,
        reload=os.getenv("RELOAD", "false").lower() == "true",
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )


if __name__ == "__main__":
    main()
