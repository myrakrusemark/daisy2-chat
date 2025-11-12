"""
Unit tests for WhisperTranscriptionService - testing parallel session functionality
"""

import asyncio
import pytest
import threading
import time
from unittest.mock import Mock, patch, MagicMock
import numpy as np

# Mock dependencies before import
import sys
from unittest import mock
sys.modules['faster_whisper'] = mock.MagicMock()
sys.modules['numpy'] = mock.MagicMock()

from src.api.whisper_service import (
    WhisperTranscriptionService, 
    TranscriptionSession, 
    TranscriptionResult
)


class TestTranscriptionSession:
    """Test TranscriptionSession data class"""
    
    def test_session_creation(self):
        """Test basic session creation"""
        callback = Mock()
        timeout_callback = Mock()
        
        session = TranscriptionSession(
            session_id="test-123",
            callback=callback,
            timeout_callback=timeout_callback,
            streaming_mode=True
        )
        
        assert session.session_id == "test-123"
        assert session.callback == callback
        assert session.streaming_mode is True
        assert len(session.audio_buffer) == 0
        assert session.accumulated_transcription == ""
    
    def test_session_defaults(self):
        """Test session creation with default values"""
        session = TranscriptionSession(
            session_id="test",
            callback=Mock(),
            timeout_callback=None,
            streaming_mode=False
        )
        
        assert session.session_start_time is None
        assert session.silence_timer is None


class TestWhisperTranscriptionService:
    """Test WhisperTranscriptionService multi-session functionality"""
    
    @pytest.fixture
    def mock_whisper_model(self):
        """Mock WhisperModel for testing"""
        with patch('src.api.whisper_service.WhisperModel') as mock_model:
            mock_instance = MagicMock()
            mock_model.return_value = mock_instance
            
            # Mock transcription results
            mock_segments = [
                MagicMock(text=" Hello world"),
                MagicMock(text=" This is a test")
            ]
            mock_info = MagicMock()
            mock_info.language = "en"
            mock_info.language_probability = 0.95
            
            mock_instance.transcribe.return_value = (mock_segments, mock_info)
            yield mock_instance
    
    @pytest.fixture
    def service(self, mock_whisper_model):
        """Create WhisperTranscriptionService instance for testing"""
        with patch('numpy.frombuffer') as mock_frombuffer:
            mock_frombuffer.return_value = np.array([0.1, 0.2, 0.3], dtype=np.float32)
            
            service = WhisperTranscriptionService()
            service.model = mock_whisper_model
            return service
    
    def test_service_initialization(self, service):
        """Test service initializes correctly"""
        assert service.is_available()
        assert len(service.active_sessions) == 0
        assert service.max_session_duration == 20.0
        assert service.silence_timeout == 3.0
        assert service.audio_thread_pool.max_workers == 8
    
    @pytest.mark.asyncio
    async def test_single_session_start_stop(self, service):
        """Test starting and stopping a single session"""
        callback = Mock()
        
        # Start session
        success = await service.start_transcription(
            session_id="session-1",
            callback=callback,
            streaming_mode=True
        )
        
        assert success is True
        assert "session-1" in service.active_sessions
        assert len(service.active_sessions) == 1
        
        # Stop session
        stopped = await service.stop_transcription("session-1")
        assert stopped is True
        assert len(service.active_sessions) == 0
    
    @pytest.mark.asyncio
    async def test_multiple_concurrent_sessions(self, service):
        """Test multiple concurrent transcription sessions"""
        callback1 = Mock()
        callback2 = Mock()
        callback3 = Mock()
        
        # Start multiple sessions
        success1 = await service.start_transcription("session-1", callback1)
        success2 = await service.start_transcription("session-2", callback2)
        success3 = await service.start_transcription("session-3", callback3)
        
        assert all([success1, success2, success3])
        assert len(service.active_sessions) == 3
        assert "session-1" in service.active_sessions
        assert "session-2" in service.active_sessions
        assert "session-3" in service.active_sessions
        
        # Verify each session has independent state
        session1 = service.active_sessions["session-1"]
        session2 = service.active_sessions["session-2"]
        session3 = service.active_sessions["session-3"]
        
        assert session1.callback == callback1
        assert session2.callback == callback2
        assert session3.callback == callback3
        
        # Stop sessions individually
        await service.stop_transcription("session-2")
        assert len(service.active_sessions) == 2
        assert "session-2" not in service.active_sessions
        assert "session-1" in service.active_sessions
        assert "session-3" in service.active_sessions
    
    @pytest.mark.asyncio
    async def test_duplicate_session_id_rejected(self, service):
        """Test that duplicate session IDs are rejected"""
        callback = Mock()
        
        # Start first session
        success1 = await service.start_transcription("session-1", callback)
        assert success1 is True
        
        # Try to start session with same ID
        success2 = await service.start_transcription("session-1", callback)
        assert success2 is False
        assert len(service.active_sessions) == 1
    
    @pytest.mark.asyncio
    async def test_audio_chunk_processing_per_session(self, service):
        """Test audio chunk processing for specific sessions"""
        callback1 = Mock()
        callback2 = Mock()
        
        # Start two sessions
        await service.start_transcription("session-1", callback1)
        await service.start_transcription("session-2", callback2)
        
        # Process audio for session-1
        fake_audio = b"fake_webm_audio_data_1"
        success1 = await service.process_audio_chunk("session-1", fake_audio)
        assert success1 is True
        
        # Check that audio was added to session-1 buffer
        session1 = service.active_sessions["session-1"]
        session2 = service.active_sessions["session-2"]
        
        assert len(session1.audio_buffer) == len(fake_audio)
        assert len(session2.audio_buffer) == 0  # Session-2 buffer untouched
        
        # Process different audio for session-2
        fake_audio2 = b"different_audio_data_2"
        success2 = await service.process_audio_chunk("session-2", fake_audio2)
        assert success2 is True
        
        assert len(session2.audio_buffer) == len(fake_audio2)
        assert len(session1.audio_buffer) == len(fake_audio)  # Session-1 unchanged
    
    @pytest.mark.asyncio
    async def test_audio_chunk_nonexistent_session(self, service):
        """Test processing audio for non-existent session"""
        success = await service.process_audio_chunk("nonexistent", b"audio")
        assert success is False
    
    def test_service_status_multiple_sessions(self, service):
        """Test service status with multiple active sessions"""
        # Initially no sessions
        status = service.get_status()
        assert status["total_sessions"] == 0
        assert status["active_sessions"] == []
        
        # Add sessions manually for testing
        session1 = TranscriptionSession("s1", Mock(), None, True)
        session2 = TranscriptionSession("s2", Mock(), None, False)
        
        service.active_sessions["s1"] = session1
        service.active_sessions["s2"] = session2
        
        status = service.get_status()
        assert status["total_sessions"] == 2
        assert set(status["active_sessions"]) == {"s1", "s2"}
        assert status["available"] is True
    
    @pytest.mark.asyncio
    async def test_session_timeout_handling(self, service):
        """Test individual session timeout handling"""
        callback = Mock()
        timeout_callback = Mock()
        
        # Create session with very short timeout for testing
        await service.start_transcription(
            "session-1", 
            callback, 
            timeout_callback=timeout_callback
        )
        
        session = service.active_sessions["session-1"]
        session.session_start_time = time.time() - 25  # 25 seconds ago (exceeds 20s limit)
        session.accumulated_transcription = "Test transcription"
        
        # Check timeout
        timed_out = service._check_session_timeout(session)
        assert timed_out is True
        
        # Wait a moment for async timeout handler
        await asyncio.sleep(0.1)
    
    def test_session_silence_timer_management(self, service):
        """Test session-specific silence timer management"""
        session1 = TranscriptionSession("s1", Mock(), None, True)
        session2 = TranscriptionSession("s2", Mock(), None, True)
        
        # Reset timers for both sessions
        service._reset_session_silence_timer(session1)
        service._reset_session_silence_timer(session2)
        
        assert session1.silence_timer is not None
        assert session2.silence_timer is not None
        assert session1.silence_timer != session2.silence_timer
        
        # Clear timer for session1 only
        service._clear_session_silence_timer(session1)
        assert session1.silence_timer is None
        assert session2.silence_timer is not None
        
        # Clean up
        service._clear_session_silence_timer(session2)
    
    @pytest.mark.asyncio 
    async def test_concurrent_session_performance(self, service):
        """Test that multiple sessions don't significantly impact performance"""
        callbacks = [Mock() for _ in range(5)]
        session_ids = [f"perf-session-{i}" for i in range(5)]
        
        # Measure time to start multiple sessions
        start_time = time.time()
        
        tasks = []
        for i in range(5):
            task = service.start_transcription(session_ids[i], callbacks[i])
            tasks.append(task)
        
        results = await asyncio.gather(*tasks)
        
        elapsed = time.time() - start_time
        
        # All sessions should start successfully
        assert all(results)
        assert len(service.active_sessions) == 5
        
        # Should be fast (under 1 second for 5 sessions)
        assert elapsed < 1.0
        
        # Clean up
        for session_id in session_ids:
            await service.stop_transcription(session_id)


class TestTranscriptionResult:
    """Test TranscriptionResult data class"""
    
    def test_result_creation(self):
        """Test creating transcription result"""
        result = TranscriptionResult(
            text="Hello world",
            is_final=True,
            confidence=0.95,
            language="en"
        )
        
        assert result.text == "Hello world"
        assert result.is_final is True
        assert result.confidence == 0.95
        assert result.language == "en"
    
    def test_result_defaults(self):
        """Test result with default values"""
        result = TranscriptionResult(
            text="Test",
            is_final=False
        )
        
        assert result.confidence == 0.0
        assert result.language == "en"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])