"""Real-time whisper transcription service using whisper-live and faster-whisper"""

import asyncio
import logging
import threading
import time
import wave
import io
import base64
import tempfile
import subprocess
import numpy as np
from typing import Callable, Optional, AsyncGenerator
from dataclasses import dataclass

try:
    from faster_whisper import WhisperModel
    import numpy as np
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
            raise ImportError("faster-whisper and numpy are required for server transcription")
        
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
            audio_data: WebM/Opus audio data from browser
            
        Returns:
            True if processed successfully
        """
        if not self.is_transcribing:
            log.warning("Not transcribing, ignoring audio chunk")
            return False
            
        try:
            log.info(f"Received audio chunk: {len(audio_data)} bytes")
            
            # Add to buffer for batch processing
            with self.buffer_lock:
                self.audio_buffer.extend(audio_data)
                
                # Process when we have enough data (0.5 seconds worth of WebM data)
                # WebM chunks are compressed, so we use a smaller threshold
                if len(self.audio_buffer) >= 2000:  # ~0.5s of WebM audio
                    # Extract audio for processing
                    audio_to_process = bytes(self.audio_buffer)
                    self.audio_buffer.clear()  # Clear buffer for next batch
                    
                    # Process audio in background
                    asyncio.create_task(self._process_webm_audio(audio_to_process))
            
            return True
            
        except Exception as e:
            log.error(f"Error processing audio chunk: {e}")
            return False

    async def _process_webm_audio(self, audio_data: bytes):
        """Process WAV audio data directly"""
        try:
            log.info(f"Processing WAV audio: {len(audio_data)} bytes")
            
            # For WAV format, try direct conversion first
            try:
                # WAV files have a 44-byte header, skip it and convert to numpy
                if len(audio_data) < 44:
                    log.warning("Audio data too short (less than WAV header)")
                    return
                
                # Extract raw PCM data (skip WAV header)
                pcm_data = audio_data[44:]
                
                # Convert to numpy array (assuming 16-bit PCM)
                audio_array = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32) / 32768.0
                
                log.info(f"Converted WAV to numpy: {len(audio_array)} samples, {len(audio_array)/self.sample_rate:.2f}s")
                
                # Skip very short audio
                if len(audio_array) < self.sample_rate * 0.1:  # Less than 100ms
                    log.debug("Skipping short audio segment")
                    return
                
                # Process with Whisper directly
                await self._process_audio_async(audio_array)
                
            except Exception as wav_error:
                log.warning(f"Direct WAV processing failed: {wav_error}, trying FFmpeg fallback")
                
                # Fallback to FFmpeg conversion if direct parsing fails
                audio_array = await self._convert_audio_to_wav(audio_data)
                if audio_array is None:
                    log.warning("FFmpeg conversion also failed")
                    return
                
                await self._process_audio_async(audio_array)
            
        except Exception as e:
            log.error(f"Error processing audio: {e}")

    async def _convert_audio_to_wav(self, audio_data: bytes) -> Optional[np.ndarray]:
        """Convert WebM/Opus audio to numpy array for Whisper"""
        try:
            # Create temporary files
            with tempfile.NamedTemporaryFile(suffix='.webm') as input_file, \
                 tempfile.NamedTemporaryFile(suffix='.wav') as output_file:
                
                # Write input audio
                input_file.write(audio_data)
                input_file.flush()
                
                # Convert using ffmpeg
                ffmpeg_cmd = [
                    'ffmpeg', '-y', '-i', input_file.name,
                    '-ar', str(self.sample_rate),  # 16kHz
                    '-ac', '1',  # mono
                    '-f', 'wav',
                    output_file.name
                ]
                
                # Run conversion in thread pool
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None, 
                    lambda: subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
                )
                
                if result.returncode != 0:
                    log.error(f"FFmpeg conversion failed: {result.stderr}")
                    return None
                
                # Read converted audio
                output_file.seek(0)
                audio_bytes = output_file.read()
                
                # Convert to numpy array
                audio_array = np.frombuffer(audio_bytes[44:], dtype=np.int16).astype(np.float32) / 32768.0
                return audio_array
                
        except Exception as e:
            log.error(f"Error converting audio: {e}")
            return None

    async def _process_audio_async(self, audio_array: np.ndarray):
        """Process audio data asynchronously using faster-whisper"""
        try:
            # Skip very short audio chunks
            if len(audio_array) < self.sample_rate * 0.1:  # Less than 100ms
                log.debug("Skipping short audio chunk")
                return
            
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
            log.debug(f"Transcribing audio: {len(audio_array)} samples, {len(audio_array)/self.sample_rate:.2f}s")
            
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
                log.debug(f"Segment: '{segment.text.strip()}'")
            
            combined_text = " ".join(text_parts).strip()
            log.info(f"Transcription result: '{combined_text}'")
            
            if combined_text:
                return TranscriptionResult(
                    text=combined_text,
                    is_final=True,  # Each chunk is considered final
                    confidence=info.language_probability if hasattr(info, 'language_probability') else 0.9,
                    language=info.language if hasattr(info, 'language') else self.language
                )
            else:
                log.debug("No transcription result (empty or silence)")
                
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