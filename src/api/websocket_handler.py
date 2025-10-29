"""WebSocket message handler for real-time communication"""

import json
import logging
import asyncio
import base64
import uuid
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
from .tts_service import TTSService

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
        self.current_task = None  # Track the current processing task
        self.current_request_id = None  # Track the current request ID to ignore old messages

        # Initialize TTS service
        self.tts = TTSService()

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
            tool_profile=self.session.config.permission_mode,
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

    async def send_assistant_message(self, content: str, tool_calls: Optional[list] = None, request_id: str = None):
        """Send assistant response"""
        # Only send if request is still active
        if request_id and self.current_request_id != request_id:
            log.info(f"🚫 BLOCKED assistant_message from cancelled request {request_id} (current: {self.current_request_id})")
            return

        log.info(f"✅ Sending assistant_message for request {request_id}")
        await self.send_message(AssistantMessage(
            content=content,
            tool_calls=tool_calls or []
        ).model_dump())

    async def send_tool_use(self, tool_name: str, tool_input: dict, summary: str, request_id: str = None):
        """Send tool usage notification"""
        # Only send if request is still active
        if request_id and self.current_request_id != request_id:
            log.info(f"🚫 BLOCKED tool_use from cancelled request {request_id} (current: {self.current_request_id})")
            return

        log.info(f"✅ Sending tool_use for request {request_id}")
        await self.send_message(ToolUseMessage(
            tool=tool_name,
            input=tool_input,
            summary=summary
        ).model_dump())

    async def stream_tts_audio(self, text: str, request_id: str = None):
        """
        Stream TTS audio to client

        Args:
            text: Text to synthesize and stream
            request_id: Optional request ID to validate this message belongs to active request
        """
        try:
            # Check if request is still active
            if request_id and self.current_request_id != request_id:
                log.info(f"🚫 BLOCKED TTS from cancelled request {request_id} (current: {self.current_request_id})")
                return

            log.info(f"✅ Starting TTS for request {request_id}")
            # Send TTS start message
            await self.send_message({
                "type": "tts_start",
                "text": text
            })

            # Stream audio chunks
            async for audio_chunk in self.tts.synthesize_streaming(text):
                # Check again during streaming
                if request_id and self.current_request_id != request_id:
                    log.info(f"🚫 CANCELLED TTS stream from request {request_id} (current: {self.current_request_id})")
                    break

                # Encode audio chunk as base64 for JSON transmission
                audio_b64 = base64.b64encode(audio_chunk).decode('utf-8')

                # Send audio chunk
                await self.send_message({
                    "type": "tts_audio",
                    "data": audio_b64
                })

            # Send TTS end message (only if request still active)
            if not request_id or self.current_request_id == request_id:
                await self.send_message({
                    "type": "tts_end"
                })

        except Exception as e:
            log.error(f"Error streaming TTS audio: {e}")
            await self.send_error(f"TTS error: {str(e)}")

    async def _process_user_message(self, content: str):
        """
        Internal method to process user message (can be cancelled)

        Args:
            content: Transcribed text from user
        """
        # Generate unique request ID for this request
        request_id = str(uuid.uuid4())
        self.current_request_id = request_id
        log.info(f"Processing request {request_id}")

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
                # Send tool use notification to browser (with request ID validation)
                await self.send_tool_use(tool_name, tool_input, summary, request_id=request_id)

            # Define callback for tool summary updates
            async def on_tool_summary_update(tool_name: str, tool_input: dict, better_summary: str):
                """Callback when a better AI-generated summary is ready"""
                # Ignore if this request has been interrupted
                if self.current_request_id != request_id:
                    log.info(f"🚫 BLOCKED tool_summary_update from cancelled request {request_id} (current: {self.current_request_id})")
                    return

                log.info(f"✅ Sending tool_summary_update for request {request_id}")
                # Send tool summary update to browser
                await self.send_message({
                    "type": "tool_summary_update",
                    "tool": tool_name,
                    "input": tool_input,
                    "summary": better_summary
                })

                # Stream TTS audio for the tool summary (with request ID validation)
                await self.stream_tts_audio(better_summary, request_id=request_id)

            # Execute Claude Code request with streaming
            result = await self.session.claude_client.execute_streaming(
                prompt=content,
                on_tool_use=on_tool_use,
                on_tool_summary_update=on_tool_summary_update,
                conversation_history=self.session.conversation.history,
            )

            # Check if this request is still active (not interrupted by a new request)
            if self.current_request_id != request_id:
                log.info(f"🚫 Request {request_id} was interrupted, ignoring result (current: {self.current_request_id})")
                return

            if not result["success"]:
                await self.send_error(result["response"])
                return

            response_text = result["response"]
            tool_calls = result.get("tool_calls", [])

            # Final check before sending response
            if self.current_request_id != request_id:
                log.info(f"🚫 Request {request_id} was interrupted before sending response (current: {self.current_request_id})")
                return

            # Add to conversation history
            self.session.conversation.add_assistant_message(response_text, tool_calls=tool_calls)

            # Send final response to browser (WITHOUT tool_calls - those were already streamed)
            await self.send_assistant_message(response_text, tool_calls=None, request_id=request_id)

            # Stream TTS audio to browser (with request ID validation)
            if response_text and response_text.strip():
                await self.stream_tts_audio(response_text, request_id=request_id)

            # Mark processing complete (only if still active)
            if self.current_request_id == request_id:
                await self.send_processing("complete")

        except asyncio.CancelledError:
            log.info("User message processing was cancelled")
            await self.send_error("Request cancelled by user")
            raise  # Re-raise to properly clean up the task
        except Exception as e:
            log.error(f"Error handling user message: {e}")
            await self.send_error(f"Error processing message: {str(e)}")

        finally:
            self.processing = False
            self.current_task = None

    async def handle_user_message(self, content: str):
        """
        Handle user message from browser STT

        Args:
            content: Transcribed text from user
        """
        if not content.strip():
            await self.send_error("Empty message received")
            return

        # Create and track the processing task
        self.current_task = asyncio.create_task(self._process_user_message(content))

        try:
            await self.current_task
        except asyncio.CancelledError:
            log.info("User message task was cancelled")
            # Task was cancelled, no need to re-raise

    async def handle_interrupt(self, reason: str):
        """
        Handle user interrupt signal

        Args:
            reason: Reason for interruption
        """
        log.info(f"⛔ INTERRUPT received: {reason}")
        self.interrupted = True

        # Invalidate the current request ID so any pending messages are ignored
        old_request_id = self.current_request_id
        self.current_request_id = None
        log.info(f"⛔ INVALIDATED request {old_request_id} - current is now None")

        # Kill the Claude Code subprocess to stop it from responding
        await self.session.claude_client.interrupt_and_reset()

        # Cancel the current processing task if it exists
        if self.current_task and not self.current_task.done():
            log.info("Cancelling current processing task")
            self.current_task.cancel()
            self.current_task = None

        # If Claude is speaking (TTS in browser), browser handles stopping audio
        # Subprocess is killed and will restart on next request (context preserved)

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
