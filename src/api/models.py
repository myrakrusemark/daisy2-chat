"""Pydantic models for API requests and responses"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class SessionCreate(BaseModel):
    """Request to create a new session"""
    working_directory: Optional[str] = None
    tool_profile: Optional[str] = "coding"
    allowed_tools: Optional[List[str]] = None
    permission_mode: Optional[str] = "bypassPermissions"


class SessionInfo(BaseModel):
    """Session information"""
    session_id: str
    working_directory: str
    conversation_id: str
    tool_profile: str
    allowed_tools: List[str]
    permission_mode: str
    created_at: datetime
    last_activity: datetime


class ConfigUpdate(BaseModel):
    """Update session configuration"""
    working_directory: Optional[str] = None
    allowed_tools: Optional[List[str]] = None
    permission_mode: Optional[str] = None


class UserMessage(BaseModel):
    """User message from browser"""
    type: str = "user_message"
    content: str


class AssistantMessage(BaseModel):
    """Assistant response to browser"""
    type: str = "assistant_message"
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None


class ToolUseMessage(BaseModel):
    """Tool usage notification"""
    type: str = "tool_use"
    tool: str
    input: Dict[str, Any]
    summary: str


class ProcessingMessage(BaseModel):
    """Processing status message"""
    type: str = "processing"
    status: str  # "thinking", "executing", "complete"


class ErrorMessage(BaseModel):
    """Error notification"""
    type: str = "error"
    message: str


class InterruptMessage(BaseModel):
    """User interrupt signal"""
    type: str = "interrupt"
    reason: str


class SessionInfoMessage(BaseModel):
    """Session information message"""
    type: str = "session_info"
    session_id: str
    working_dir: str
    conversation_id: str
    tool_profile: str


class ConversationHistory(BaseModel):
    """Conversation history response"""
    conversation_id: str
    messages: List[Dict[str, Any]]
    message_count: int


class DownloadLinkRequest(BaseModel):
    """Request to generate a download link"""
    session_id: str
    file_path: str
    expiry_minutes: int = 5


class DownloadLinkResponse(BaseModel):
    """Response with download link"""
    token: str
    download_url: str
    expires_at: str
    file_type: str  # "file" or "directory"
    message: str
