"""TTS service using Piper with audio streaming"""

import asyncio
import logging
import os
import io
import wave
from pathlib import Path
from typing import AsyncGenerator
import base64

from piper import PiperVoice

log = logging.getLogger(__name__)


class TTSService:
    """Piper TTS service with streaming support"""

    def __init__(self, model_path: Path = None):
        """Initialize TTS service

        Args:
            model_path: Path to Piper .onnx model file
        """
        if model_path is None:
            # Default to the British English female voice
            model_path = Path(__file__).parent.parent.parent / "models" / "piper" / "en_GB-southern_english_female-low.onnx"

        self.model_path = model_path
        self.voice = None

        if not self.model_path.exists():
            raise FileNotFoundError(f"Piper model not found at {model_path}")

        # Initialize Piper voice
        self._load_voice()

        log.info(f"TTS service initialized with model: {model_path}")

    def _load_voice(self):
        """Load the Piper voice model"""
        try:
            self.voice = PiperVoice.load(str(self.model_path))
            log.info("Piper voice loaded successfully")
        except Exception as e:
            log.error(f"Failed to load Piper voice: {e}")
            raise

    async def synthesize_streaming(self, text: str) -> AsyncGenerator[bytes, None]:
        """
        Synthesize speech and yield audio chunks as they're generated

        Args:
            text: Text to synthesize

        Yields:
            Audio data chunks as bytes (WAV format)
        """
        if not text or not text.strip():
            return

        try:
            # Synthesize audio using Piper
            # voice.synthesize() returns Iterable[AudioChunk]
            audio_chunks = list(self.voice.synthesize(text))

            if not audio_chunks:
                log.warning("No audio chunks generated")
                return

            # Get audio format from first chunk
            sample_rate = self.voice.config.sample_rate
            sample_width = 2  # 16-bit audio
            channels = 1  # mono

            # Collect all audio data
            all_audio_data = b''
            for chunk in audio_chunks:
                # AudioChunk has 'audio_int16_bytes' property
                all_audio_data += chunk.audio_int16_bytes

            # Create WAV file in memory
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(channels)
                wav_file.setsampwidth(sample_width)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(all_audio_data)

            # Get complete WAV data
            wav_data = wav_buffer.getvalue()

            # Yield the complete WAV file (could chunk it if needed)
            yield wav_data

        except Exception as e:
            log.error(f"Error in TTS synthesis: {e}")
            raise

    async def synthesize(self, text: str) -> bytes:
        """
        Synthesize speech and return complete audio data

        Args:
            text: Text to synthesize

        Returns:
            Complete WAV audio data as bytes
        """
        chunks = []
        async for chunk in self.synthesize_streaming(text):
            chunks.append(chunk)

        return b''.join(chunks)
