"""Text-to-speech using Piper TTS"""

import subprocess
import tempfile
from pathlib import Path
from typing import Optional
import numpy as np
import soundfile as sf
import sounddevice as sd
import pyrubberband as pyrb
import logging

log = logging.getLogger(__name__)


class PiperTTS:
    """Piper text-to-speech engine"""

    def __init__(self, model_path: Path, speed: float = 1.0):
        """
        Initialize Piper TTS

        Args:
            model_path: Path to the Piper .onnx model file
            speed: Playback speed multiplier (e.g., 1.3 for 30% faster)
        """
        self.model_path = model_path
        self.speed = speed
        self.should_stop = False

        if not self.model_path.exists():
            raise FileNotFoundError(f"Piper model not found at {model_path}")

        log.info(f"Initialized Piper TTS with model: {model_path}, speed: {speed}x")

    def stop(self):
        """Stop current speech playback"""
        self.should_stop = True
        sd.stop()

    def speak(self, text: str, blocking: bool = True) -> None:
        """
        Speak text using Piper TTS

        Args:
            text: Text to speak
            blocking: If True, wait for speech to complete before returning
        """
        if not text or not text.strip():
            return

        # Reset stop flag at start of new speech
        self.should_stop = False

        try:
            # Create temporary file for audio output
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
                temp_path = temp_wav.name

            # Run Piper to generate speech
            process = subprocess.Popen(
                ["piper", "--model", str(self.model_path), "--output_file", temp_path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )

            # Send text to Piper
            stdout, stderr = process.communicate(input=text)

            if process.returncode != 0:
                log.error(f"Piper TTS failed: {stderr}")
                return

            # Check if stop was requested before playing
            if self.should_stop:
                Path(temp_path).unlink(missing_ok=True)
                return

            # Play the generated audio with speed adjustment (pitch-preserving)
            data, samplerate = sf.read(temp_path)

            # Apply time stretching if speed is not 1.0 (preserves pitch)
            if self.speed != 1.0:
                data = pyrb.time_stretch(data, samplerate, self.speed)

            # Check again before playing
            if self.should_stop:
                Path(temp_path).unlink(missing_ok=True)
                return

            sd.play(data, samplerate, blocking=blocking)

            # Clean up temp file after playback
            Path(temp_path).unlink(missing_ok=True)

        except Exception as e:
            log.error(f"Error in TTS: {e}")

    def speak_async(self, text: str) -> None:
        """Speak text without blocking"""
        self.speak(text, blocking=False)
