"""Speech-to-text using Picovoice Cheetah"""

import logging
import sounddevice as sd
import pvcheetah
from typing import Optional

log = logging.getLogger(__name__)


class CheetahSTT:
    """Picovoice Cheetah streaming speech-to-text"""

    def __init__(self, access_key: str):
        """
        Initialize Cheetah STT

        Args:
            access_key: Picovoice access key
        """
        self.cheetah = pvcheetah.create(access_key=access_key)
        self.sample_rate = self.cheetah.sample_rate
        self.frame_length = self.cheetah.frame_length

        log.info(f"Initialized Cheetah STT (sample_rate: {self.sample_rate} Hz, frame_length: {self.frame_length})")

    def listen(self, silence_threshold: int = 20) -> str:
        """
        Listen for speech and transcribe to text

        Args:
            silence_threshold: Number of silence frames before stopping

        Returns:
            Transcribed text
        """
        transcription_parts = []
        silence_count = 0
        speech_started = False

        # Open audio stream with Cheetah's required parameters
        audio_stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype='int16',
            blocksize=self.frame_length
        )

        audio_stream.start()
        log.info("Listening for speech...")

        try:
            while True:
                # Read audio frame
                frame, overflowed = audio_stream.read(self.frame_length)
                if overflowed:
                    log.warning("Audio buffer overflow")

                frame = frame.flatten()

                # Process frame through Cheetah for real-time transcription
                partial_transcript, is_endpoint = self.cheetah.process(frame)

                # Accumulate transcript
                if partial_transcript:
                    transcription_parts.append(partial_transcript)
                    speech_started = True
                    silence_count = 0
                    log.debug(f"Partial: {partial_transcript}")

                # Check for endpoint (natural pause in speech)
                if is_endpoint:
                    log.info("Speech endpoint detected")
                    break

                # Track silence after speech has started
                if speech_started:
                    if not partial_transcript:
                        silence_count += 1
                    if silence_count > silence_threshold:
                        log.info("Silence threshold reached")
                        break

        finally:
            audio_stream.stop()
            audio_stream.close()

        # Finalize transcription (flush any remaining audio)
        final_transcript = self.cheetah.flush()
        if final_transcript:
            transcription_parts.append(final_transcript)

        # Combine all transcript parts
        full_transcription = "".join(transcription_parts).strip()
        log.info(f"Transcription: {full_transcription}")

        return full_transcription

    def cleanup(self):
        """Release Cheetah resources"""
        if self.cheetah:
            self.cheetah.delete()
            log.info("Cheetah STT cleaned up")

    def __del__(self):
        """Cleanup on deletion"""
        self.cleanup()
