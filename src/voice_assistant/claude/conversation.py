"""Conversation history management"""

import logging
import yaml
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime

log = logging.getLogger(__name__)


class ConversationManager:
    """Manage conversation history and persistence"""

    def __init__(self, conversations_dir: Path, conversation_id: Optional[str] = None):
        """
        Initialize conversation manager

        Args:
            conversations_dir: Directory to store conversation files
            conversation_id: Optional conversation ID (generates new one if not provided)
        """
        self.conversations_dir = Path(conversations_dir)
        self.conversations_dir.mkdir(parents=True, exist_ok=True)

        self.conversation_id = conversation_id or self._generate_id()
        self.history: List[Dict[str, Any]] = []

        # Load existing conversation if it exists
        self._load()

        log.info(f"Conversation manager initialized (ID: {self.conversation_id})")

    def _generate_id(self) -> str:
        """Generate a unique conversation ID"""
        return uuid.uuid4().hex[:5]  # Short hex ID like 'a7b3e'

    def _get_conversation_path(self) -> Path:
        """Get path to conversation file"""
        return self.conversations_dir / f"{self.conversation_id}.yml"

    def _load(self):
        """Load conversation history from disk if it exists"""
        path = self._get_conversation_path()

        if path.exists():
            try:
                with open(path, 'r') as f:
                    self.history = yaml.safe_load(f) or []
                log.info(f"Loaded conversation with {len(self.history)} messages")
            except Exception as e:
                log.error(f"Failed to load conversation: {e}")
                self.history = []

    def save(self):
        """Save conversation history to disk"""
        path = self._get_conversation_path()

        try:
            with open(path, 'w') as f:
                yaml.dump(self.history, f, default_flow_style=False, allow_unicode=True)
            log.debug(f"Saved conversation to {path}")
        except Exception as e:
            log.error(f"Failed to save conversation: {e}")

    def add_user_message(self, content: str, metadata: Optional[Dict[str, Any]] = None):
        """Add user message to history"""
        message = {
            "role": "user",
            "content": content,
            "timestamp": datetime.now().isoformat()
        }

        if metadata:
            message["metadata"] = metadata

        self.history.append(message)
        self.save()

    def add_assistant_message(
        self,
        content: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Add assistant message to history"""
        message = {
            "role": "assistant",
            "content": content,
            "timestamp": datetime.now().isoformat()
        }

        if tool_calls:
            message["tool_calls"] = tool_calls

        if metadata:
            message["metadata"] = metadata

        self.history.append(message)
        self.save()

    def get_formatted_history(self, max_messages: Optional[int] = None) -> str:
        """
        Get formatted conversation history for prompt injection

        Args:
            max_messages: Maximum number of recent messages to include

        Returns:
            Formatted history string
        """
        history = self.history[-max_messages:] if max_messages else self.history

        if not history:
            return "This is the start of the conversation."

        formatted_parts = ["Previous conversation:"]

        for msg in history:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")

            if role == "user":
                formatted_parts.append(f"\nUser: {content}")
            elif role == "assistant":
                formatted_parts.append(f"\nAssistant: {content}")

        return "\n".join(formatted_parts)

    def clear(self):
        """Clear conversation history"""
        self.history = []
        self.save()
        log.info("Conversation history cleared")

    def get_summary(self) -> Dict[str, Any]:
        """Get conversation summary metadata"""
        return {
            "conversation_id": self.conversation_id,
            "message_count": len(self.history),
            "user_messages": len([m for m in self.history if m.get("role") == "user"]),
            "assistant_messages": len([m for m in self.history if m.get("role") == "assistant"]),
            "file_path": str(self._get_conversation_path())
        }
