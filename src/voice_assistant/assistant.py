"""Main voice assistant orchestrator"""

import logging
import signal
import os
from pathlib import Path
from typing import Optional

from .config import AssistantConfig, CLAUDE_PROMPT_TEMPLATE
from .audio.wake_word import WakeWordDetector
from .audio.stt import CheetahSTT
from .audio.tts import PiperTTS
from .audio.sounds import SoundEffects
from .claude.client import ClaudeCodeClient
from .claude.conversation import ConversationManager
from .ui.console import AssistantUI

log = logging.getLogger(__name__)


class VoiceAssistant:
    """Main voice-enabled Claude Code assistant"""

    def __init__(self, config: AssistantConfig, initial_prompt: Optional[str] = None):
        """
        Initialize voice assistant

        Args:
            config: Assistant configuration
            initial_prompt: Optional prompt to process immediately
        """
        self.config = config
        self.initial_prompt = initial_prompt
        self.initial_prompt_used = False
        self.stop_speaking = False

        # Initialize UI
        self.ui = AssistantUI()

        # Initialize sound effects
        self.sounds = SoundEffects(
            sounds_dir=config.sounds_dir,
            enabled=config.audio.enable_sound_effects
        )

        # Initialize wake word detector
        self.wake_word = WakeWordDetector(
            access_key=config.picovoice.access_key,
            keyword_path=config.audio.wake_word_model
        )

        # Initialize STT
        self.stt = CheetahSTT(access_key=config.picovoice.access_key)

        # Initialize TTS
        self.tts = PiperTTS(model_path=config.audio.piper_model, speed=config.audio.tts_speed)

        # Initialize Claude Code client
        self.claude = ClaudeCodeClient(
            working_directory=config.working_directory,
            allowed_tools=config.claude.allowed_tools,
            permission_mode=config.claude.permission_mode,
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY")
        )

        # Initialize conversation manager
        self.conversation = ConversationManager(
            conversations_dir=config.conversations_dir,
            conversation_id=config.conversation_id
        )

        # Set up signal handlers
        self._setup_signal_handlers()

        log.info("Voice assistant initialized")

    def _setup_signal_handlers(self):
        """Set up signal handlers for graceful interruption"""
        def sigint_handler(signum, frame):
            if not self.stop_speaking:
                self.stop_speaking = True
                self.tts.stop()  # Stop any ongoing TTS playback
                log.info("Ctrl+C detected - returning to wake word")
            else:
                log.info("Ctrl+C detected again - exiting")
                raise KeyboardInterrupt

        signal.signal(signal.SIGINT, sigint_handler)

    async def run(self):
        """Main assistant loop"""
        # Show banner
        summary = self.conversation.get_summary()
        self.ui.show_banner(
            conversation_id=summary["conversation_id"],
            working_dir=str(self.config.working_directory)
        )

        # Start persistent Claude process
        self.ui.show_info("Starting Claude Code process...")
        await self.claude._start_persistent_claude()
        self.ui.show_success("Claude Code process ready")

        # If initial prompt provided, process it immediately
        if self.initial_prompt:
            self.ui.show_info(f"Processing initial prompt: {self.initial_prompt}")
            await self._process_request(self.initial_prompt)
            self.initial_prompt_used = True

        # Main loop
        try:
            while True:
                # Wait for wake word
                self.ui.show_info(f"Waiting for wake word: '{self.config.picovoice.wake_word}'")
                self.sounds.play_sleep(blocking=False)

                if not self.wake_word.listen_for_wake_word():
                    continue

                self.sounds.play_wake_word(blocking=False)
                self.ui.show_success("Wake word detected!")

                # Listen for user request
                self.stop_speaking = False
                user_input = await self._listen()

                if not user_input or user_input.strip() == "":
                    self.ui.show_warning("No speech detected")
                    continue

                # Process the request
                await self._process_request(user_input)

        except KeyboardInterrupt:
            self.ui.show_info("\nShutting down...")
            self.sounds.play_sleep(blocking=True)

        finally:
            self._cleanup()

    async def _listen(self) -> str:
        """Listen for user speech"""
        # Use initial prompt if available and not yet used
        if self.initial_prompt and not self.initial_prompt_used:
            self.initial_prompt_used = True
            return self.initial_prompt

        self.sounds.play_wake(blocking=True)
        self.ui.show_listening()

        try:
            transcription = self.stt.listen()
            return transcription
        except Exception as e:
            log.error(f"Error during listening: {e}")
            self.ui.show_error(f"Listening error: {e}")
            return ""

    async def _process_request(self, user_input: str):
        """Process user request through Claude with streaming"""
        self.ui.show_user_message(user_input)

        # Add to conversation history
        self.conversation.add_user_message(user_input)

        # Build prompt with conversation history
        formatted_history = self.conversation.get_formatted_history(max_messages=10)
        full_prompt = CLAUDE_PROMPT_TEMPLATE.format(formatted_history=formatted_history)

        # Show processing indicator
        self.ui.show_processing()

        # Define callback for tool usage events (called in real-time as tools are used)
        def on_tool_use(tool_name: str, tool_input: dict, summary: str):
            """Callback when a tool is used during streaming"""
            # Display tool usage in console
            self.ui.show_tool_use(tool_name, tool_input)

            # Play tool sound
            self.sounds.play_tool(blocking=False)

            # Speak the summary (blocking - so user hears what's happening)
            log.info(f"Speaking tool summary: {summary}")
            self.tts.speak(summary, blocking=True)

        # Execute Claude Code request with streaming
        result = await self.claude.execute_streaming(
            prompt=user_input,
            conversation_history=self.conversation.history,
            on_tool_use=on_tool_use
        )

        if not result["success"]:
            self.ui.show_error(result["response"])
            return

        response_text = result["response"]
        tool_calls = result.get("tool_calls", [])

        # Add to conversation history
        self.conversation.add_assistant_message(response_text, tool_calls=tool_calls)

        # Show final response
        self.ui.show_assistant_message(response_text, tool_calls=tool_calls)

        # Speak final response
        self.tts.speak(response_text, blocking=True)

    def _cleanup(self):
        """Clean up resources"""
        log.info("Cleaning up resources...")

        if hasattr(self, 'wake_word'):
            self.wake_word.cleanup()

        if hasattr(self, 'stt'):
            self.stt.cleanup()

        if hasattr(self, 'claude'):
            self.claude.cleanup()

        log.info("Cleanup complete")
