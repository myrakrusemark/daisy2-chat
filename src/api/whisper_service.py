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
import signal
from typing import Callable, Optional, AsyncGenerator, Dict
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

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


@dataclass
class TranscriptionSession:
    """Individual transcription session state"""
    session_id: str
    callback: Callable[[TranscriptionResult], None]
    timeout_callback: Optional[Callable[[str], None]]
    streaming_mode: bool
    
    # Audio buffer for this session
    audio_buffer: bytearray = field(default_factory=bytearray)
    cumulative_audio: bytearray = field(default_factory=bytearray)
    
    # Session timing
    session_start_time: Optional[float] = None
    last_transcription_time: Optional[float] = None
    
    # Accumulated text for timeout handling
    accumulated_transcription: str = ""
    
    # Session-specific timers
    silence_timer: Optional[threading.Timer] = None


class WhisperTranscriptionService:
    """Real-time whisper transcription service"""
    
    def __init__(self, model_size: str = "tiny", language: str = "en"):
        """
        Initialize whisper transcription service
        
        Args:
            model_size: Whisper model size (tiny=fastest, base, small, medium, large=best quality)
            language: Language code for transcription
        """
        if not WHISPER_AVAILABLE:
            raise ImportError("faster-whisper and numpy are required for server transcription")
        
        self.model_size = model_size
        self.language = language
        self.sample_rate = 16000
        self.channels = 1
        
        # Multi-session management
        self.active_sessions: Dict[str, TranscriptionSession] = {}
        self.sessions_lock = threading.Lock()
        
        # Global settings for all sessions
        self.streaming_chunk_size = 16000  # 1 second of 16kHz audio (in samples)
        self.silence_timeout = 3.0  # 3 seconds of silence before auto-stop
        self.max_session_duration = 20.0  # 20 seconds max session
        
        # Initialize faster-whisper model
        self.model = None
        self._initialize_model()
        
        # Initialize thread pool for audio processing - increased for concurrent sessions
        self.audio_thread_pool = ThreadPoolExecutor(
            max_workers=8,  # Increased from 4 to 8 for better concurrent session support
            thread_name_prefix="whisper_audio"
        )
        
        log.info(f"WhisperTranscriptionService initialized with model: {model_size}, language: {language} (multi-session support)")

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
        callback: Callable[[TranscriptionResult], None],
        streaming_mode: bool = False,
        timeout_callback: Optional[Callable[[str], None]] = None
    ) -> bool:
        """
        Start real-time transcription session
        
        Args:
            session_id: Unique session identifier
            callback: Function to call with transcription results
            streaming_mode: If True, process chunks immediately for live transcription
            timeout_callback: Function to call when session times out with accumulated text
            
        Returns:
            True if started successfully
        """
        with self.sessions_lock:
            if session_id in self.active_sessions:
                log.warning(f"Transcription session {session_id} already active")
                return False
            
            try:
                # Create new transcription session
                session = TranscriptionSession(
                    session_id=session_id,
                    callback=callback,
                    timeout_callback=timeout_callback,
                    streaming_mode=streaming_mode,
                    session_start_time=time.time()
                )
                
                self.active_sessions[session_id] = session
                log.info(f"Started transcription session: {session_id} (total active: {len(self.active_sessions)})")
                return True
                
            except Exception as e:
                log.error(f"Failed to start transcription session {session_id}: {e}")
                return False

    async def stop_transcription(self, session_id: str) -> bool:
        """
        Stop specific transcription session
        
        Args:
            session_id: Session ID to stop
            
        Returns:
            True if session was stopped, False if not found
        """
        with self.sessions_lock:
            session = self.active_sessions.pop(session_id, None)
            if not session:
                log.warning(f"Transcription session {session_id} not found")
                return False
            
            # Clear session-specific timers
            self._clear_session_silence_timer(session)
            
            log.info(f"Stopped transcription session: {session_id} (remaining active: {len(self.active_sessions)})")
            return True

    async def process_audio_chunk(self, session_id: str, audio_data: bytes) -> bool:
        """
        Process incoming audio chunk for specific session
        
        Args:
            session_id: Session ID to process audio for
            audio_data: WebM/Opus audio data from browser
            
        Returns:
            True if processed successfully
        """
        with self.sessions_lock:
            session = self.active_sessions.get(session_id)
            if not session:
                log.warning(f"Session {session_id} not found, ignoring audio chunk")
                return False
            
        # Check for session timeout
        if self._check_session_timeout(session):
            return False
            
        try:
            log.info(f"Received audio chunk for session {session_id}: {len(audio_data)} bytes")
            
            # Add to session-specific buffer
            session.audio_buffer.extend(audio_data)
            
            if session.streaming_mode:
                # Process each chunk for streaming transcription
                audio_to_process = bytes(session.audio_buffer)
                session.audio_buffer.clear()
                
                # Process audio with cumulative context
                asyncio.create_task(self._process_streaming_audio(session, audio_to_process))
            else:
                # In batch mode, accumulate chunks before processing
                if len(session.audio_buffer) >= 2000:  # ~0.5s of WebM audio
                    audio_to_process = bytes(session.audio_buffer)
                    session.audio_buffer.clear()
                    
                    # Process audio in background
                    asyncio.create_task(self._process_audio_file(session, audio_to_process, streaming=False))
            
            return True
            
        except Exception as e:
            log.error(f"Error processing audio chunk for session {session_id}: {e}")
            return False

    async def _process_streaming_audio(self, session: TranscriptionSession, audio_data: bytes):
        """Process 1-second WebM audio chunk with cumulative context for streaming transcription"""
        try:
            # Add raw WebM chunk to session's cumulative buffer (don't convert individual chunks)
            session.cumulative_audio.extend(audio_data)
            
            # Process combined WebM every ~2 seconds worth of data
            # WebM chunks are ~16KB each, so ~32KB = ~2 seconds
            if len(session.cumulative_audio) >= 32000:  # ~2 seconds of WebM data
                log.info(f"Processing combined WebM audio for session {session.session_id}: {len(session.cumulative_audio)} bytes")
                
                # Convert combined WebM to audio array
                combined_webm = bytes(session.cumulative_audio)
                audio_array = await self._convert_audio_to_wav(combined_webm)
                
                if audio_array is not None:
                    duration = len(audio_array) / self.sample_rate
                    log.info(f"Transcribing combined audio for session {session.session_id}: {len(audio_array)} samples, {duration:.1f}s")
                    
                    # Process combined audio for transcription
                    await self._process_audio_async(session, audio_array, streaming=True)
                else:
                    log.warning(f"Failed to convert combined WebM audio for session {session.session_id}")
                
                # Keep last 15 seconds worth of WebM data (prevent memory issues)
                max_webm_size = 16000 * 15  # ~15 seconds of WebM chunks
                if len(session.cumulative_audio) > max_webm_size:
                    # Keep only the last ~10 seconds of WebM data
                    keep_size = 16000 * 10  # ~10 seconds
                    session.cumulative_audio = session.cumulative_audio[-keep_size:]
                    log.debug(f"Trimmed cumulative WebM buffer to last ~10 seconds for session {session.session_id}")
                    
        except Exception as e:
            log.error(f"Error in streaming audio processing for session {session.session_id}: {e}")

    async def _process_audio_file(self, session: TranscriptionSession, audio_data: bytes, streaming: bool = False):
        """Process audio file (WAV/WebM) directly"""
        try:
            # Detect format based on file signature
            format_type = "unknown"
            if audio_data.startswith(b'RIFF') and b'WAVE' in audio_data[:12]:
                format_type = "WAV"
            elif audio_data.startswith(b'\x1a\x45\xdf\xa3'):
                format_type = "WebM"
            
            log.info(f"Processing {format_type} audio: {len(audio_data)} bytes")
            
            # Try direct WAV processing first if it looks like a WAV file
            if format_type == "WAV":
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
                    await self._process_audio_async(session, audio_array, streaming=streaming)
                    return
                    
                except Exception as wav_error:
                    log.warning(f"Direct WAV processing failed: {wav_error}")
            
            # For WebM or if WAV processing failed, use FFmpeg conversion
            log.info(f"Using FFmpeg to convert {format_type} audio")
            audio_array = await self._convert_audio_to_wav(audio_data)
            if audio_array is None:
                log.warning("FFmpeg conversion failed")
                return
            
            await self._process_audio_async(session, audio_array, streaming=streaming)
            
        except Exception as e:
            log.error(f"Error processing audio: {e}")

    async def _convert_audio_to_wav(self, audio_data: bytes) -> Optional[np.ndarray]:
        """Convert WebM/Opus audio to numpy array for Whisper (optimized direct processing)"""
        try:
            # Try to extract raw PCM data directly from WebM container
            # This is much faster than spawning FFmpeg subprocess for every chunk
            
            # First, try direct WAV processing if it looks like WAV
            if audio_data.startswith(b'RIFF') and b'WAVE' in audio_data[:12]:
                try:
                    # Extract raw PCM data (skip WAV header)
                    if len(audio_data) > 44:
                        pcm_data = audio_data[44:]
                        audio_array = np.frombuffer(pcm_data, dtype=np.int16).astype(np.float32) / 32768.0
                        return audio_array
                except Exception:
                    pass
            
            # For WebM/Opus: Use single persistent FFmpeg process instead of spawning new ones
            # TODO: Implement streaming FFmpeg or use opus decoder library directly
            # For now, fall back to subprocess but with optimized command
            return await self._convert_audio_subprocess_optimized(audio_data)
                
        except Exception as e:
            log.error(f"Error converting audio: {e}")
            return None

    async def _convert_audio_subprocess_optimized(self, audio_data: bytes) -> Optional[np.ndarray]:
        """Optimized FFmpeg subprocess call with reduced overhead"""
        try:
            # Use pipes instead of temporary files to reduce I/O overhead
            ffmpeg_cmd = [
                'ffmpeg', '-y', 
                '-f', 'webm', '-i', 'pipe:0',  # Read from stdin
                '-ar', str(self.sample_rate),   # 16kHz
                '-ac', '1',                     # mono
                '-f', 's16le',                  # Raw 16-bit little-endian PCM
                'pipe:1'                        # Write to stdout
            ]
            
            # Run conversion in our dedicated thread pool with pipes and timeout
            loop = asyncio.get_event_loop()
            try:
                result = await loop.run_in_executor(
                    self.audio_thread_pool, 
                    lambda: subprocess.run(
                        ffmpeg_cmd, 
                        input=audio_data, 
                        capture_output=True,
                        timeout=10  # 10 second timeout to prevent hanging
                    )
                )
            except subprocess.TimeoutExpired:
                log.error("FFmpeg conversion timed out after 10 seconds")
                return None
            except Exception as e:
                log.error(f"FFmpeg execution failed: {e}")
                return None
            
            if result.returncode != 0:
                log.error(f"FFmpeg conversion failed (code {result.returncode}): {result.stderr}")
                return None
            
            # Convert raw PCM to numpy array
            try:
                audio_array = np.frombuffer(result.stdout, dtype=np.int16).astype(np.float32) / 32768.0
                return audio_array
            except Exception as e:
                log.error(f"Error converting FFmpeg output to numpy array: {e}")
                return None
                
        except Exception as e:
            log.error(f"Error in optimized audio conversion: {e}")
            return None

    async def _process_audio_async(self, session: TranscriptionSession, audio_array: np.ndarray, streaming: bool = False):
        """Process audio data asynchronously using faster-whisper"""
        try:
            # In streaming mode, process even shorter chunks for real-time feedback
            min_duration = 0.05 if streaming else 0.1  # 50ms vs 100ms
            
            if len(audio_array) < self.sample_rate * min_duration:
                log.debug(f"Skipping short audio chunk ({len(audio_array)} samples)")
                return
            
            # Run transcription in our dedicated thread pool with asyncio timeout
            loop = asyncio.get_event_loop()
            try:
                # Use asyncio.wait_for instead of signal-based timeout (signals don't work in thread pools)
                result = await asyncio.wait_for(
                    loop.run_in_executor(self.audio_thread_pool, self._transcribe_audio_internal, audio_array, streaming),
                    timeout=15.0  # 15 second timeout
                )
            except asyncio.TimeoutError:
                log.error("Whisper transcription timed out after 15 seconds")
                result = None
            except Exception as e:
                log.error(f"Error in whisper transcription: {e}")
                result = None
            
            if result and session.callback:
                # Update last transcription time when we get actual text
                if result.text.strip():
                    session.last_transcription_time = time.time()
                    self._reset_session_silence_timer(session)
                    
                    # Accumulate transcription text for timeout handling
                    if session.accumulated_transcription:
                        session.accumulated_transcription += " " + result.text.strip()
                    else:
                        session.accumulated_transcription = result.text.strip()
                
                session.callback(result)
                
        except Exception as e:
            log.error(f"Error in async audio processing: {e}")

    def _transcribe_audio_internal(self, audio_array: np.ndarray, streaming: bool = False) -> Optional[TranscriptionResult]:
        """Internal transcription method (blocking call)"""
        try:
            log.debug(f"Transcribing audio: {len(audio_array)} samples, {len(audio_array)/self.sample_rate:.2f}s, streaming={streaming}")
            
            # Adjust VAD parameters based on streaming mode
            if streaming:
                # More aggressive VAD for real-time processing
                vad_params = dict(
                    min_silence_duration_ms=200,  # Shorter silence detection
                    max_speech_duration_s=30,     # Longer speech segments
                    speech_pad_ms=30              # Minimal padding
                )
            else:
                # Standard VAD for batch processing
                vad_params = dict(min_silence_duration_ms=500)
            
            # Use faster-whisper for transcription
            segments, info = self.model.transcribe(
                audio_array,
                language=self.language,
                task="transcribe",
                vad_filter=True,  # Voice activity detection
                vad_parameters=vad_params,
                word_timestamps=False
            )
            
            # Combine all segments
            text_parts = []
            for segment in segments:
                text_parts.append(segment.text.strip())
                log.debug(f"Segment: '{segment.text.strip()}'")
            
            combined_text = " ".join(text_parts).strip()
            log.info(f"Transcription result: '{combined_text}' (streaming={streaming})")
            
            if combined_text:
                return TranscriptionResult(
                    text=combined_text,
                    is_final=not streaming,  # Streaming results are interim until final
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
        with self.sessions_lock:
            active_session_ids = list(self.active_sessions.keys())
            
        return {
            "available": self.is_available(),
            "active_sessions": active_session_ids,
            "total_sessions": len(active_session_ids),
            "model_size": self.model_size,
            "language": self.language,
            "sample_rate": self.sample_rate
        }

    def _clear_session_silence_timer(self, session: TranscriptionSession):
        """Clear the silence detection timer for a specific session"""
        if session.silence_timer:
            session.silence_timer.cancel()
            session.silence_timer = None

    def _reset_session_silence_timer(self, session: TranscriptionSession):
        """Reset the silence timer for auto-stopping transcription"""
        self._clear_session_silence_timer(session)
        
        # Start a new timer that will trigger silence handling
        session.silence_timer = threading.Timer(
            self.silence_timeout, 
            lambda: self._handle_session_silence(session.session_id)
        )
        session.silence_timer.start()

    def _handle_session_silence(self, session_id: str):
        """Handle silence timeout by auto-stopping transcription"""
        with self.sessions_lock:
            session = self.active_sessions.get(session_id)
            if not session:
                return
            
        if session.accumulated_transcription.strip():
            log.info(f"Silence detected for session {session_id}, auto-submitting: '{session.accumulated_transcription[:50]}...'")
            if session.timeout_callback:
                session.timeout_callback(session.accumulated_transcription.strip())
            asyncio.create_task(self.stop_transcription(session_id))
        else:
            log.info(f"Silence detected for session {session_id} but no text to submit, stopping transcription")
            asyncio.create_task(self.stop_transcription(session_id))

    def _check_session_timeout(self, session: TranscriptionSession) -> bool:
        """
        Check if the transcription session has exceeded the timeout duration
        
        Returns:
            True if session timed out and was handled, False otherwise
        """
        if not session.session_start_time:
            return False
            
        elapsed_time = time.time() - session.session_start_time
        if elapsed_time >= self.max_session_duration:
            log.info(f"Transcription session {session.session_id} timed out after {elapsed_time:.1f} seconds")
            
            # Trigger timeout callback with accumulated text
            if session.timeout_callback and session.accumulated_transcription.strip():
                log.info(f"Auto-submitting accumulated transcription for session {session.session_id}: '{session.accumulated_transcription[:50]}...'")
                asyncio.create_task(self._handle_session_timeout(session.session_id))
            else:
                log.info(f"Session {session.session_id} timed out but no text to submit")
                asyncio.create_task(self.stop_transcription(session.session_id))
            
            return True
        
        return False

    async def _handle_session_timeout(self, session_id: str):
        """Handle session timeout by submitting accumulated text"""
        try:
            with self.sessions_lock:
                session = self.active_sessions.get(session_id)
                if not session:
                    return
                    
            final_text = session.accumulated_transcription.strip()
            if final_text and session.timeout_callback:
                session.timeout_callback(final_text)
            await self.stop_transcription(session_id)
        except Exception as e:
            log.error(f"Error handling timeout for session {session_id}: {e}")
            await self.stop_transcription(session_id)


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