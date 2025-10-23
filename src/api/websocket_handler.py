"""WebSocket message handler for real-time communication"""

import json
import logging
import asyncio
from typing import Callable, Optional
from fastapi import WebSocket

from .models import (
    UserMessage,
    AssistantMessage,
    ToolUseMessage,
    ProcessingMessage,
    ErrorMessage,
    InterruptMessage,
    SessionInfoMessage,
)
from .session_manager import Session

log = logging.getLogger(__name__)


class WebSocketHandler:
    """Handle WebSocket communication for a session"""

    def __init__(self, websocket: WebSocket, session: Session):
        """
        Initialize WebSocket handler

        Args:
            websocket: FastAPI WebSocket connection
            session: Session object
        """
        self.websocket = websocket
        self.session = session
        self.processing = False
        self.interrupted = False

    async def send_message(self, message_data: dict):
        """
        Send JSON message to client

        Args:
            message_data: Dictionary to send as JSON
        """
        try:
            await self.websocket.send_json(message_data)
        except Exception as e:
            log.error(f"Error sending WebSocket message: {e}")

    async def send_session_info(self):
        """Send session information to client"""
        await self.send_message(SessionInfoMessage(
            session_id=self.session.session_id,
            working_dir=str(self.session.config.working_directory),
            conversation_id=self.session.conversation.conversation_id,
            tool_profile=self.session.config.claude.permission_mode,
        ).model_dump())

    async def send_processing(self, status: str):
        """Send processing status"""
        await self.send_message(ProcessingMessage(
            status=status
        ).model_dump())

    async def send_error(self, error_message: str):
        """Send error message"""
        await self.send_message(ErrorMessage(
            message=error_message
        ).model_dump())

    async def send_assistant_message(self, content: str, tool_calls: Optional[list] = None):
        """Send assistant response"""
        await self.send_message(AssistantMessage(
            content=content,
            tool_calls=tool_calls or []
        ).model_dump())

    async def send_tool_use(self, tool_name: str, tool_input: dict, summary: str):
        """Send tool usage notification"""
        await self.send_message(ToolUseMessage(
            tool=tool_name,
            input=tool_input,
            summary=summary
        ).model_dump())

    async def handle_user_message(self, content: str):
        """
        Handle user message from browser STT

        Args:
            content: Transcribed text from user
        """
        if not content.strip():
            await self.send_error("Empty message received")
            return

        try:
            # Mark as processing
            self.processing = True
            self.interrupted = False

            # Add to conversation history
            self.session.conversation.add_user_message(content)

            # Send processing status
            await self.send_processing("thinking")

            # Define callback for tool usage events
            async def on_tool_use(tool_name: str, tool_input: dict, summary: str):
                """Callback when a tool is used during streaming"""
                if self.interrupted:
                    return

                # Send tool use notification to browser
                await self.send_tool_use(tool_name, tool_input, summary)

            # Execute Claude Code request with streaming
            result = await self.session.claude_client.execute_streaming(
                prompt=content,
                on_tool_use=on_tool_use,
                conversation_history=self.session.conversation.history,
            )

            # Check if interrupted
            if self.interrupted:
                await self.send_error("Request interrupted by user")
                return

            if not result["success"]:
                await self.send_error(result["response"])
                return

            response_text = result["response"]
            tool_calls = result.get("tool_calls", [])

            # Add to conversation history
            self.session.conversation.add_assistant_message(response_text, tool_calls=tool_calls)

            # Send final response to browser for TTS
            await self.send_assistant_message(response_text, tool_calls)

            # Mark processing complete
            await self.send_processing("complete")

        except Exception as e:
            log.error(f"Error handling user message: {e}")
            await self.send_error(f"Error processing message: {str(e)}")

        finally:
            self.processing = False

    async def handle_interrupt(self, reason: str):
        """
        Handle user interrupt signal

        Args:
            reason: Reason for interruption
        """
        log.info(f"Interrupt received: {reason}")
        self.interrupted = True

        # If Claude is speaking (TTS in browser), browser handles stopping audio
        # Just mark as interrupted and stop processing

    async def handle_config_update(self, config_data: dict):
        """
        Handle configuration update

        Args:
            config_data: New configuration data
        """
        try:
            working_dir = config_data.get("working_directory")
            allowed_tools = config_data.get("allowed_tools")
            permission_mode = config_data.get("permission_mode")

            # Update session config (this will be handled by the server endpoint)
            await self.send_message({
                "type": "config_updated",
                "success": True
            })

        except Exception as e:
            log.error(f"Error updating config: {e}")
            await self.send_error(f"Failed to update configuration: {str(e)}")

    async def handle_message(self, message_data: dict):
        """
        Route incoming WebSocket message to appropriate handler

        Args:
            message_data: Parsed JSON message from client
        """
        message_type = message_data.get("type")

        if message_type == "user_message":
            await self.handle_user_message(message_data.get("content", ""))

        elif message_type == "interrupt":
            await self.handle_interrupt(message_data.get("reason", "user_stopped"))

        elif message_type == "config_update":
            await self.handle_config_update(message_data.get("config", {}))

        else:
            log.warning(f"Unknown message type: {message_type}")
            await self.send_error(f"Unknown message type: {message_type}")

    async def listen(self):
        """Main WebSocket message loop"""
        try:
            # Send session info on connect
            await self.send_session_info()

            # Listen for messages
            while True:
                # Receive message
                data = await self.websocket.receive_text()

                # Parse JSON
                try:
                    message_data = json.loads(data)
                    await self.handle_message(message_data)
                except json.JSONDecodeError as e:
                    log.error(f"Invalid JSON received: {e}")
                    await self.send_error("Invalid JSON format")

        except Exception as e:
            log.error(f"WebSocket error: {e}")
