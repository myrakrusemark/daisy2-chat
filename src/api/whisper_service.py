"""Real-time whisper transcription service using whisper-live and faster-whisper"""

import asyncio
import logging
import threading
import time
import wave
import io
import numpy as np
from typing import Callable, Optional, AsyncGenerator
from dataclasses import dataclass

try:
    from whisper_live.client import TranscriptionClient
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

log = logging.getLogger(__name__)


@dataclass
class TranscriptionResult:
    """Result from whisper transcription"""
    text: str
    is_final: bool
    confidence: float = 0.0
    language: str = "en"


class WhisperTranscriptionService:
    """Real-time whisper transcription service"""
    
    def __init__(self, model_size: str = "base", language: str = "en"):
        """
        Initialize whisper transcription service
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large)
            language: Language code for transcription
        """
        if not WHISPER_AVAILABLE:
            raise ImportError("whisper-live and faster-whisper are required for server transcription")
        
        self.model_size = model_size
        self.language = language
        self.sample_rate = 16000
        self.channels = 1
        
        # Transcription state
        self.is_transcribing = False
        self.current_session_id = None
        self.transcription_callback = None
        
        # Audio buffer for processing
        self.audio_buffer = bytearray()
        self.buffer_lock = threading.Lock()
        
        # Initialize faster-whisper model
        self.model = None
        self._initialize_model()
        
        log.info(f"WhisperTranscriptionService initialized with model: {model_size}, language: {language}")

    def _initialize_model(self):
        """Initialize the faster-whisper model"""
        try:
            # Use CPU for now, can be configured for GPU later
            self.model = WhisperModel(
                self.model_size, 
                device="cpu",
                compute_type="int8"  # Optimize for speed
            )
            log.info(f"Faster-whisper model '{self.model_size}' loaded successfully")
        except Exception as e:
            log.error(f"Failed to initialize whisper model: {e}")
            raise

    async def start_transcription(
        self, 
        session_id: str, 
        callback: Callable[[TranscriptionResult], None]
    ) -> bool:
        """
        Start real-time transcription session
        
        Args:
            session_id: Unique session identifier
            callback: Function to call with transcription results
            
        Returns:
            True if started successfully
        """
        if self.is_transcribing:
            log.warning("Transcription already in progress")
            return False
            
        try:
            self.current_session_id = session_id
            self.transcription_callback = callback
            self.is_transcribing = True
            
            # Clear audio buffer
            with self.buffer_lock:
                self.audio_buffer.clear()
            
            log.info(f"Started transcription session: {session_id}")
            return True
            
        except Exception as e:
            log.error(f"Failed to start transcription: {e}")
            self.is_transcribing = False
            return False

    async def stop_transcription(self):
        """Stop current transcription session"""
        if not self.is_transcribing:
            return
            
        self.is_transcribing = False
        self.current_session_id = None
        self.transcription_callback = None
        
        # Clear audio buffer
        with self.buffer_lock:
            self.audio_buffer.clear()
            
        log.info("Stopped transcription session")

    async def process_audio_chunk(self, audio_data: bytes) -> bool:
        """
        Process incoming audio chunk
        
        Args:
            audio_data: Raw audio data (16-bit PCM, 16kHz, mono)
            
        Returns:
            True if processed successfully
        """
        if not self.is_transcribing:
            return False
            
        try:
            # Add to buffer
            with self.buffer_lock:
                self.audio_buffer.extend(audio_data)
                
                # Process when we have enough data (1 second worth)
                bytes_per_second = self.sample_rate * 2  # 16-bit = 2 bytes per sample
                if len(self.audio_buffer) >= bytes_per_second:
                    # Extract audio for processing
                    audio_to_process = bytes(self.audio_buffer[:bytes_per_second])
                    self.audio_buffer = self.audio_buffer[bytes_per_second:]
                    
                    # Process audio in background thread to avoid blocking
                    asyncio.create_task(self._process_audio_async(audio_to_process))
            
            return True
            
        except Exception as e:
            log.error(f"Error processing audio chunk: {e}")
            return False

    async def _process_audio_async(self, audio_data: bytes):
        """Process audio data asynchronously using faster-whisper"""
        try:
            # Convert bytes to numpy array
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Run transcription in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self._transcribe_audio, audio_array)
            
            if result and self.transcription_callback:
                self.transcription_callback(result)
                
        except Exception as e:
            log.error(f"Error in async audio processing: {e}")

    def _transcribe_audio(self, audio_array: np.ndarray) -> Optional[TranscriptionResult]:
        """Transcribe audio using faster-whisper (blocking call)"""
        try:
            # Use faster-whisper for transcription
            segments, info = self.model.transcribe(
                audio_array,
                language=self.language,
                task="transcribe",
                vad_filter=True,  # Voice activity detection
                vad_parameters=dict(min_silence_duration_ms=500),
                word_timestamps=False
            )
            
            # Combine all segments
            text_parts = []
            for segment in segments:
                text_parts.append(segment.text.strip())
            
            combined_text = " ".join(text_parts).strip()
            
            if combined_text:
                return TranscriptionResult(
                    text=combined_text,
                    is_final=True,  # Each chunk is considered final
                    confidence=info.language_probability if hasattr(info, 'language_probability') else 0.9,
                    language=info.language if hasattr(info, 'language') else self.language
                )
                
            return None
            
        except Exception as e:
            log.error(f"Transcription error: {e}")
            return None

    def is_available(self) -> bool:
        """Check if whisper transcription is available"""
        return WHISPER_AVAILABLE and self.model is not None

    def get_status(self) -> dict:
        """Get current service status"""
        return {
            "available": self.is_available(),
            "transcribing": self.is_transcribing,
            "session_id": self.current_session_id,
            "model_size": self.model_size,
            "language": self.language,
            "sample_rate": self.sample_rate
        }


class AudioProcessor:
    """Helper class to convert various audio formats to the required format"""
    
    @staticmethod
    def convert_webm_to_pcm(webm_data: bytes, target_sample_rate: int = 16000) -> bytes:
        """
        Convert WebM audio to PCM format
        Note: This is a placeholder - actual implementation would need ffmpeg or similar
        """
        # For now, assume the audio is already in the correct format
        # In a real implementation, you'd use ffmpeg-python or similar
        log.warning("Audio format conversion not implemented - assuming correct format")
        return webm_data
    
    @staticmethod
    def resample_audio(audio_data: bytes, from_rate: int, to_rate: int) -> bytes:
        """
        Resample audio to target rate
        Note: This is a placeholder for actual resampling logic
        """
        if from_rate == to_rate:
            return audio_data
        
        # Simple placeholder - in reality you'd use librosa or scipy
        log.warning(f"Audio resampling not implemented ({from_rate}Hz -> {to_rate}Hz)")
        return audio_data