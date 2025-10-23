"""Wake word detection using Picovoice Porcupine"""

import logging
import struct
import sounddevice as sd
import pvporcupine
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)


class WakeWordDetector:
    """Porcupine wake word detector"""

    def __init__(self, access_key: str, keyword_path: Optional[Path] = None):
        """
        Initialize wake word detector

        Args:
            access_key: Picovoice access key
            keyword_path: Optional path to custom .ppn wake word file
        """
        self.access_key = access_key
        self.keyword_path = keyword_path
        self.porcupine = None
        self.sample_rate = None
        self.frame_length = None

        self._initialize()

    def _initialize(self):
        """Initialize Porcupine"""
        try:
            if self.keyword_path and self.keyword_path.exists():
                # Use custom wake word
                self.porcupine = pvporcupine.create(
                    access_key=self.access_key,
                    keyword_paths=[str(self.keyword_path)]
                )
                log.info(f"Initialized Porcupine with custom wake word: {self.keyword_path}")
            else:
                # Use built-in wake word (picovoice, porcupine, etc.)
                self.porcupine = pvporcupine.create(
                    access_key=self.access_key,
                    keywords=["porcupine"]  # Default built-in keyword
                )
                log.info("Initialized Porcupine with built-in 'porcupine' wake word")

            self.sample_rate = self.porcupine.sample_rate
            self.frame_length = self.porcupine.frame_length

            log.info(f"Porcupine ready (sample_rate: {self.sample_rate} Hz, frame_length: {self.frame_length})")

        except Exception as e:
            log.error(f"Failed to initialize Porcupine: {e}")
            raise

    def listen_for_wake_word(self) -> bool:
        """
        Listen for wake word

        Returns:
            True if wake word detected, False on error or interrupt
        """
        if not self.porcupine:
            log.error("Porcupine not initialized")
            return False

        log.info("Listening for wake word...")

        # Open audio stream
        audio_stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype='int16',
            blocksize=self.frame_length
        )

        audio_stream.start()

        try:
            while True:
                # Read frame
                pcm, overflowed = audio_stream.read(self.frame_length)
                if overflowed:
                    log.warning("Audio buffer overflow")

                # Convert to 1D array and process
                pcm = pcm.flatten()

                # Check for wake word
                keyword_index = self.porcupine.process(pcm)

                if keyword_index >= 0:
                    log.info("Wake word detected!")
                    audio_stream.stop()
                    audio_stream.close()
                    return True

        except KeyboardInterrupt:
            log.info("Wake word detection interrupted")
            audio_stream.stop()
            audio_stream.close()
            return False

        except Exception as e:
            log.error(f"Error during wake word detection: {e}")
            audio_stream.stop()
            audio_stream.close()
            return False

    def cleanup(self):
        """Release Porcupine resources"""
        if self.porcupine:
            self.porcupine.delete()
            self.porcupine = None
            log.info("Porcupine cleaned up")

    def __del__(self):
        """Cleanup on deletion"""
        self.cleanup()
