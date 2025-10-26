"""Session manager for handling multiple concurrent sessions"""

import uuid
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional, List
from dataclasses import dataclass, field

from src.voice_assistant.config import create_default_config, AssistantConfig
from src.voice_assistant.claude.client import ClaudeCodeClient
from src.voice_assistant.claude.conversation import ConversationManager

log = logging.getLogger(__name__)


@dataclass
class Session:
    """Active session state"""
    session_id: str
    config: AssistantConfig
    claude_client: ClaudeCodeClient
    conversation: ConversationManager
    created_at: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)
    websocket: Optional[object] = None


class SessionManager:
    """Manage multiple concurrent user sessions"""

    def __init__(self, max_sessions: int = 10, session_timeout: int = 3600):
        """
        Initialize session manager

        Args:
            max_sessions: Maximum number of concurrent sessions
            session_timeout: Session timeout in seconds
        """
        self.max_sessions = max_sessions
        self.session_timeout = session_timeout
        self.sessions: Dict[str, Session] = {}
        log.info(f"Session manager initialized (max_sessions: {max_sessions})")

    async def create_session(
        self,
        working_directory: Optional[Path] = None,
        tool_profile: Optional[str] = "coding",
        allowed_tools: Optional[List[str]] = None,
        permission_mode: Optional[str] = None,
    ) -> Session:
        """
        Create a new session

        Args:
            working_directory: Working directory for Claude operations
            tool_profile: Tool allowlist profile name
            allowed_tools: Override allowed tools list
            permission_mode: Permission mode

        Returns:
            Session object
        """
        # Check session limit
        if len(self.sessions) >= self.max_sessions:
            # Try to cleanup old sessions
            self._cleanup_inactive_sessions()
            if len(self.sessions) >= self.max_sessions:
                raise RuntimeError(f"Maximum sessions ({self.max_sessions}) reached")

        # Generate session ID
        session_id = uuid.uuid4().hex[:12]

        # Create configuration
        config = create_default_config(
            working_directory=working_directory,
            tool_profile=tool_profile,
            allowed_tools=allowed_tools,
            permission_mode=permission_mode,
        )

        # Initialize Claude client
        claude_client = ClaudeCodeClient(
            working_directory=config.working_directory,
            allowed_tools=config.claude.allowed_tools,
            permission_mode=config.claude.permission_mode,
            anthropic_api_key=config.claude.api_key,
        )

        # Initialize conversation manager
        conversation = ConversationManager(
            conversations_dir=config.conversations_dir,
            conversation_id=None,  # Auto-generate
        )

        # Create session
        session = Session(
            session_id=session_id,
            config=config,
            claude_client=claude_client,
            conversation=conversation,
        )

        self.sessions[session_id] = session
        log.info(f"Created session {session_id} (total: {len(self.sessions)})")

        # Start Claude process immediately
        log.info(f"Starting Claude process for session {session_id}")
        await claude_client._start_persistent_claude()
        log.info(f"Claude process ready for session {session_id}")

        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID"""
        session = self.sessions.get(session_id)
        if session:
            session.last_activity = datetime.now()
        return session

    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a session

        Args:
            session_id: Session ID to delete

        Returns:
            True if deleted, False if not found
        """
        session = self.sessions.pop(session_id, None)
        if session:
            # Cleanup Claude client
            if hasattr(session.claude_client, 'cleanup'):
                await session.claude_client.cleanup()
            log.info(f"Deleted session {session_id} (remaining: {len(self.sessions)})")
            return True
        return False

    def list_sessions(self) -> List[Dict[str, any]]:
        """List all active sessions"""
        return [
            {
                "session_id": session.session_id,
                "conversation_id": session.conversation.conversation_id,
                "working_directory": str(session.config.working_directory),
                "created_at": session.created_at.isoformat(),
                "last_activity": session.last_activity.isoformat(),
            }
            for session in self.sessions.values()
        ]

    async def _cleanup_inactive_sessions(self):
        """Remove sessions that have been inactive"""
        now = datetime.now()
        to_remove = []

        for session_id, session in self.sessions.items():
            inactive_seconds = (now - session.last_activity).total_seconds()
            if inactive_seconds > self.session_timeout:
                to_remove.append(session_id)

        for session_id in to_remove:
            log.info(f"Removing inactive session {session_id}")
            await self.delete_session(session_id)

    async def update_session_config(
        self,
        session_id: str,
        working_directory: Optional[Path] = None,
        allowed_tools: Optional[List[str]] = None,
        permission_mode: Optional[str] = None,
    ) -> bool:
        """
        Update session configuration

        Args:
            session_id: Session ID
            working_directory: New working directory
            allowed_tools: New allowed tools list
            permission_mode: New permission mode

        Returns:
            True if updated, False if session not found
        """
        session = self.get_session(session_id)
        if not session:
            return False

        # Update config
        if working_directory:
            session.config.working_directory = Path(working_directory)
            session.config.claude.working_directory = Path(working_directory)

        if allowed_tools:
            session.config.claude.allowed_tools = allowed_tools

        if permission_mode:
            session.config.claude.permission_mode = permission_mode

        # Recreate Claude client with new config
        await session.claude_client.cleanup()
        session.claude_client = ClaudeCodeClient(
            working_directory=session.config.working_directory,
            allowed_tools=session.config.claude.allowed_tools,
            permission_mode=session.config.claude.permission_mode,
            anthropic_api_key=session.config.claude.api_key,
        )

        log.info(f"Updated configuration for session {session_id}")
        return True
