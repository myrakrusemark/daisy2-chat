"""WebSocket message handler for real-time communication"""

import json
import logging
import asyncio
import base64
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
from .whisper_service import WhisperTranscriptionService, TranscriptionResult

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

        # Initialize TTS service
        self.tts = TTSService()
        
        # Initialize Whisper transcription service (optional)
        try:
            self.whisper = WhisperTranscriptionService()
            self.whisper_available = True
            log.info("Whisper transcription service initialized")
        except ImportError:
            self.whisper = None
            self.whisper_available = False
            log.info("Whisper transcription not available (faster-whisper not installed) - using browser STT only")

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
        log.info(f"Sending assistant message (interrupted={self.interrupted}): {content[:50]}...")
        await self.send_message(AssistantMessage(
            content=content,
            tool_calls=tool_calls or []
        ).model_dump())

    async def send_tool_use(self, tool_name: str, tool_input: dict, summary: str):
        """Send tool usage notification"""
        log.info(f"Sending tool use notification: {tool_name} (interrupted={self.interrupted})")
        await self.send_message(ToolUseMessage(
            tool=tool_name,
            input=tool_input,
            summary=summary
        ).model_dump())

    async def stream_tts_audio(self, text: str):
        """
        Stream TTS audio to client

        Args:
            text: Text to synthesize and stream
        """
        try:
            # Send TTS start message
            await self.send_message({
                "type": "tts_start",
                "text": text
            })

            # Stream audio chunks
            async for audio_chunk in self.tts.synthesize_streaming(text):
                if self.interrupted:
                    break

                # Encode audio chunk as base64 for JSON transmission
                audio_b64 = base64.b64encode(audio_chunk).decode('utf-8')

                # Send audio chunk
                await self.send_message({
                    "type": "tts_audio",
                    "data": audio_b64
                })

            # Send TTS end message
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
                log.info(f"on_tool_use callback called: {tool_name} (interrupted={self.interrupted})")
                if self.interrupted:
                    log.info(f"Skipping tool use (interrupted): {tool_name}")
                    return

                # Send tool use notification to browser
                await self.send_tool_use(tool_name, tool_input, summary)

            # Define callback for tool summary updates
            async def on_tool_summary_update(tool_name: str, tool_input: dict, better_summary: str):
                """Callback when a better AI-generated summary is ready"""
                log.info(f"on_tool_summary_update callback called: {tool_name} (interrupted={self.interrupted})")
                if self.interrupted:
                    log.info(f"Skipping tool summary update (interrupted): {tool_name}")
                    return

                # Send tool summary update to browser (no TTS for tools)
                await self.send_message({
                    "type": "tool_summary_update",
                    "tool": tool_name,
                    "input": tool_input,
                    "summary": better_summary
                })

            # Define callback for text content blocks
            async def on_text_block(text: str, is_final: bool = False):
                """Callback when a text content block is received"""
                log.info(f"on_text_block callback called (interrupted={self.interrupted}, is_final={is_final}): {text[:50]}...")
                if self.interrupted:
                    log.info("Skipping text block (interrupted)")
                    return

                # If this is just marking the block as final, don't re-send the content
                # Just send a marker message
                if is_final:
                    log.info("Marking text block as final response")
                    await self.send_message({
                        "type": "mark_final"
                    })
                    await self.send_processing("complete")
                    return

                # Send text block to browser with TTS
                await self.send_message({
                    "type": "text_block",
                    "content": text
                })

                # Stream TTS audio for the text block
                await self.stream_tts_audio(text)

            # Execute Claude Code request with streaming
            result = await self.session.claude_client.execute_streaming(
                prompt=content,
                on_tool_use=on_tool_use,
                on_tool_summary_update=on_tool_summary_update,
                on_text_block=on_text_block,
                conversation_history=self.session.conversation.history,
                is_interrupted=lambda: self.interrupted,
            )

            # Check if interrupted
            if self.interrupted:
                log.info("Interrupted after execute_streaming - not sending result")
                # Don't send error - interrupt handler already sent "process_stopped" indicator
                return

            if not result["success"]:
                await self.send_error(result["response"])
                return

            response_text = result["response"]
            tool_calls = result.get("tool_calls", [])
            already_sent = result.get("already_sent_as_text_block", False)

            # Add to conversation history IMMEDIATELY (even if interrupted)
            # This ensures anything shown in browser is also in context
            self.session.conversation.add_assistant_message(response_text, tool_calls=tool_calls)
            log.info(f"Added message to conversation history (tool_calls={len(tool_calls)})")

            # Check interrupted after adding to history
            if self.interrupted:
                log.info("Interrupted after adding to history - not sending to browser")
                return

            # Check interrupted before sending message
            if self.interrupted:
                log.info("Interrupted before sending assistant message")
                return

            # Only send final response if it wasn't already sent as a text block
            if not already_sent:
                # Send final response to browser (WITHOUT tool_calls - those were already streamed)
                await self.send_assistant_message(response_text, tool_calls=None)

                # Check interrupted before TTS
                if self.interrupted:
                    log.info("Interrupted before TTS")
                    return

                # Stream TTS audio to browser
                if response_text and response_text.strip():
                    await self.stream_tts_audio(response_text)

                # Mark processing complete
                await self.send_processing("complete")
            else:
                log.info("Final response already sent as text block, skipping duplicate (processing:complete already sent)")

        except asyncio.CancelledError:
            log.info("User message processing was cancelled")
            # Don't send error - interrupt handler already sent confirmation
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

        # Create and track the processing task but DON'T await it
        # This allows the WebSocket listener to continue receiving messages (like interrupts)
        self.current_task = asyncio.create_task(self._process_user_message(content))
        log.info("User message task created (not blocking websocket listener)")

    async def handle_interrupt(self, reason: str):
        """
        Handle user interrupt signal

        Args:
            reason: Reason for interruption
        """
        log.info(f"Interrupt received: {reason}")
        self.interrupted = True

        # Send immediate acknowledgment to browser as a tool-style indicator
        await self.send_message({
            "type": "process_stopped",
            "summary": "Process stopped by user"
        })

        # Kill the Claude Code subprocess to truly stop processing
        await self.session.claude_client.interrupt_and_restart()

        # Cancel the current processing task if it exists
        if self.current_task and not self.current_task.done():
            log.info("Cancelling current processing task")
            self.current_task.cancel()
            self.current_task = None

        # If Claude is speaking (TTS in browser), browser handles stopping audio
        # Task and subprocess are both stopped

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

    async def handle_start_server_transcription(self):
        """Start server-side transcription after wake word detection"""
        if not self.whisper_available:
            log.warning("Whisper transcription not available, falling back to browser STT")
            await self.send_message({
                "type": "transcription_unavailable",
                "fallback": "browser_stt"
            })
            return False

        try:
            # Create unique session ID for this transcription
            transcription_session_id = f"{self.session.session_id}_{int(asyncio.get_event_loop().time())}"
            
            # Set up transcription callback
            def on_transcription_result(result: TranscriptionResult):
                # Send transcription result to browser asynchronously
                # Use asyncio.create_task to avoid blocking the whisper processing
                try:
                    loop = asyncio.get_event_loop()
                    loop.create_task(self.send_message({
                        "type": "server_transcription_result",
                        "text": result.text,
                        "is_final": result.is_final,
                        "confidence": result.confidence,
                        "language": result.language
                    }))
                except Exception as e:
                    log.error(f"Error sending transcription result: {e}")

            # Start transcription
            success = await self.whisper.start_transcription(
                session_id=transcription_session_id,
                callback=on_transcription_result
            )

            if success:
                await self.send_message({
                    "type": "server_transcription_started",
                    "session_id": transcription_session_id
                })
                log.info(f"Started server transcription session: {transcription_session_id}")
                return True
            else:
                await self.send_error("Failed to start server transcription")
                return False

        except Exception as e:
            log.error(f"Error starting server transcription: {e}")
            await self.send_error(f"Server transcription error: {str(e)}")
            return False

    async def handle_stop_server_transcription(self):
        """Stop server-side transcription"""
        if not self.whisper_available or not self.whisper:
            return

        try:
            await self.whisper.stop_transcription()
            await self.send_message({
                "type": "server_transcription_stopped"
            })
            log.info("Stopped server transcription")

        except Exception as e:
            log.error(f"Error stopping server transcription: {e}")

    async def handle_audio_chunk(self, audio_data: str):
        """
        Handle incoming audio chunk for server transcription
        
        Args:
            audio_data: Base64 encoded audio data
        """
        if not self.whisper_available or not self.whisper:
            log.warning("Whisper not available, ignoring audio chunk")
            return

        # Process audio chunks in background to avoid blocking WebSocket
        asyncio.create_task(self._process_audio_chunk_async(audio_data))

    async def _process_audio_chunk_async(self, audio_data: str):
        """Process audio chunk asynchronously without blocking WebSocket"""
        try:
            # Decode base64 audio data
            audio_bytes = base64.b64decode(audio_data)
            log.info(f"Processing audio chunk: {len(audio_bytes)} bytes")
            
            # Process audio chunk
            success = await self.whisper.process_audio_chunk(audio_bytes)
            
            if not success:
                log.warning("Failed to process audio chunk")
            else:
                log.debug("Audio chunk processed successfully")

        except Exception as e:
            log.error(f"Error processing audio chunk: {e}")

    async def get_transcription_status(self):
        """Get current transcription service status"""
        if not self.whisper_available:
            status = {
                "available": False,
                "reason": "whisper-live not installed"
            }
        else:
            status = self.whisper.get_status()
        
        await self.send_message({
            "type": "transcription_status",
            "status": status
        })

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

        elif message_type == "start_server_transcription":
            await self.handle_start_server_transcription()

        elif message_type == "stop_server_transcription":
            await self.handle_stop_server_transcription()

        elif message_type == "audio_chunk":
            await self.handle_audio_chunk(message_data.get("data", ""))

        elif message_type == "get_transcription_status":
            await self.get_transcription_status()

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
