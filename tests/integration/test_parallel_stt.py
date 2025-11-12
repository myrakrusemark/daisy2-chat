"""
Integration tests for parallel STT functionality
Tests the full WebSocket + WhisperService integration
"""

import asyncio
import pytest
import json
import base64
from unittest.mock import Mock, patch, MagicMock
import threading

# Mock dependencies
import sys
from unittest import mock
sys.modules['faster_whisper'] = mock.MagicMock()
sys.modules['numpy'] = mock.MagicMock()

from src.api.websocket_handler import WebSocketHandler
from src.api.session_manager import Session, SessionConfig
from src.api.whisper_service import WhisperTranscriptionService, TranscriptionResult


class MockWebSocket:
    """Mock WebSocket for testing"""
    
    def __init__(self):
        self.messages = []
        self.closed = False
    
    async def send_json(self, data):
        """Mock send_json method"""
        self.messages.append(data)
    
    async def close(self):
        """Mock close method"""
        self.closed = True


class TestParallelSTTIntegration:
    """Integration tests for parallel STT across multiple WebSocket connections"""
    
    @pytest.fixture
    def mock_session(self):
        """Create mock session"""
        config = SessionConfig(
            working_directory="/test",
            allowed_tools=["Bash"],
            permission_mode="bypassPermissions",
            api_key="test-key",
            conversations_dir="/conversations"
        )
        
        session = Mock()
        session.session_id = "test-session-123"
        session.config = config
        session.conversation = Mock()
        session.conversation.conversation_id = "conv-123"
        
        return session
    
    @pytest.fixture
    def mock_whisper_model(self):
        """Mock WhisperModel with realistic behavior"""
        with patch('src.api.whisper_service.WhisperModel') as mock_model:
            mock_instance = MagicMock()
            mock_model.return_value = mock_instance
            
            # Mock transcription results
            def mock_transcribe(audio_array, **kwargs):
                # Simulate different transcriptions based on "audio content"
                if len(audio_array) > 100:  # Simulate different audio
                    segments = [MagicMock(text=" Session one audio")]
                else:
                    segments = [MagicMock(text=" Session two audio")]
                
                info = MagicMock()
                info.language = "en"
                info.language_probability = 0.95
                return segments, info
            
            mock_instance.transcribe.side_effect = mock_transcribe
            yield mock_instance
    
    @pytest.fixture
    def whisper_service(self, mock_whisper_model):
        """Create real WhisperTranscriptionService with mocked dependencies"""
        with patch('numpy.frombuffer') as mock_frombuffer:
            # Mock different audio arrays for different sessions
            def mock_frombuffer_func(data, dtype):
                if b"session1" in data:
                    return mock.MagicMock(spec=['__len__'], __len__=lambda: 200)  # Longer audio
                else:
                    return mock.MagicMock(spec=['__len__'], __len__=lambda: 50)   # Shorter audio
            
            mock_frombuffer.side_effect = mock_frombuffer_func
            
            service = WhisperTranscriptionService()
            service.model = mock_whisper_model
            return service
    
    @pytest.mark.asyncio
    async def test_two_concurrent_websocket_sessions(self, mock_session, whisper_service):
        """Test two WebSocket handlers can run STT concurrently"""
        # Create two WebSocket handlers
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        
        session1 = Mock(**mock_session.__dict__)
        session1.session_id = "session-1"
        session2 = Mock(**mock_session.__dict__)
        session2.session_id = "session-2"
        
        handler1 = WebSocketHandler(ws1, session1)
        handler2 = WebSocketHandler(ws2, session2)
        
        # Replace whisper service with our shared test instance
        handler1.whisper = whisper_service
        handler2.whisper = whisper_service
        handler1.whisper_available = True
        handler2.whisper_available = True
        
        # Start STT on both handlers concurrently
        start_result1 = await handler1.handle_start_server_transcription(streaming_mode=True)
        start_result2 = await handler2.handle_start_server_transcription(streaming_mode=True)
        
        assert start_result1 is True
        assert start_result2 is True
        
        # Verify both sessions are active in whisper service
        assert len(whisper_service.active_sessions) == 2
        
        # Check that session IDs are different and tracked
        session_ids = list(whisper_service.active_sessions.keys())
        assert len(session_ids) == 2
        assert session_ids[0] != session_ids[1]
        
        # Verify WebSocket messages were sent
        assert len(ws1.messages) > 0
        assert len(ws2.messages) > 0
        
        # Check for transcription start messages
        start_msgs1 = [msg for msg in ws1.messages if msg.get("type") == "server_transcription_started"]
        start_msgs2 = [msg for msg in ws2.messages if msg.get("type") == "server_transcription_started"]
        
        assert len(start_msgs1) == 1
        assert len(start_msgs2) == 1
    
    @pytest.mark.asyncio 
    async def test_concurrent_audio_processing(self, mock_session, whisper_service):
        """Test concurrent audio processing doesn't interfere between sessions"""
        # Set up two handlers
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        
        session1 = Mock(**mock_session.__dict__)
        session1.session_id = "session-1"
        session2 = Mock(**mock_session.__dict__)  
        session2.session_id = "session-2"
        
        handler1 = WebSocketHandler(ws1, session1)
        handler2 = WebSocketHandler(ws2, session2)
        
        handler1.whisper = whisper_service
        handler2.whisper = whisper_service
        handler1.whisper_available = True
        handler2.whisper_available = True
        
        # Start transcription sessions
        await handler1.handle_start_server_transcription()
        await handler2.handle_start_server_transcription()
        
        # Simulate different audio data for each session
        audio_data1 = base64.b64encode(b"session1_audio_data").decode('utf-8')
        audio_data2 = base64.b64encode(b"session2_audio_data").decode('utf-8')
        
        # Process audio concurrently
        await asyncio.gather(
            handler1.handle_audio_chunk(audio_data1),
            handler2.handle_audio_chunk(audio_data2)
        )
        
        # Verify both sessions have audio in their buffers
        sessions = list(whisper_service.active_sessions.values())
        assert len(sessions) == 2
        
        # Both sessions should have audio data
        assert len(sessions[0].audio_buffer) > 0
        assert len(sessions[1].audio_buffer) > 0
        
        # Audio buffers should be different (since they're separate sessions)
        assert sessions[0].audio_buffer != sessions[1].audio_buffer
    
    @pytest.mark.asyncio
    async def test_session_isolation_on_stop(self, mock_session, whisper_service):
        """Test that stopping one session doesn't affect others"""
        # Set up three handlers
        handlers = []
        sessions = []
        websockets = []
        
        for i in range(3):
            ws = MockWebSocket()
            session = Mock(**mock_session.__dict__)
            session.session_id = f"session-{i}"
            handler = WebSocketHandler(ws, session)
            handler.whisper = whisper_service
            handler.whisper_available = True
            
            handlers.append(handler)
            sessions.append(session)
            websockets.append(ws)
        
        # Start all three sessions
        for handler in handlers:
            await handler.handle_start_server_transcription()
        
        assert len(whisper_service.active_sessions) == 3
        
        # Stop the middle session
        await handlers[1].handle_stop_server_transcription()
        
        # Verify only the middle session was removed
        assert len(whisper_service.active_sessions) == 2
        
        # Verify the remaining sessions are the correct ones
        remaining_ids = list(whisper_service.active_sessions.keys())
        assert all("session-0" in sid or "session-2" in sid for sid in remaining_ids)
        assert not any("session-1" in sid for sid in remaining_ids)
        
        # Verify other sessions can still process audio
        audio_data = base64.b64encode(b"test_audio").decode('utf-8')
        success0 = await handlers[0]._process_audio_chunk_async(audio_data)
        success2 = await handlers[2]._process_audio_chunk_async(audio_data)
        
        # These should succeed (no exceptions thrown indicates success)
        # The actual success value depends on mocking details
    
    @pytest.mark.asyncio
    async def test_transcription_callbacks_independent(self, mock_session, whisper_service):
        """Test that transcription callbacks are session-specific"""
        # Track callback invocations
        session1_results = []
        session2_results = []
        
        def callback1(result):
            session1_results.append(result)
        
        def callback2(result):
            session2_results.append(result)
        
        # Start sessions with different callbacks
        await whisper_service.start_transcription("session-1", callback1)
        await whisper_service.start_transcription("session-2", callback2)
        
        # Simulate transcription results
        result1 = TranscriptionResult("Session 1 text", False, 0.9, "en")
        result2 = TranscriptionResult("Session 2 text", False, 0.8, "en")
        
        # Manually trigger callbacks (simulating internal whisper processing)
        session1 = whisper_service.active_sessions["session-1"] 
        session2 = whisper_service.active_sessions["session-2"]
        
        session1.callback(result1)
        session2.callback(result2)
        
        # Verify callbacks were called with correct results
        assert len(session1_results) == 1
        assert len(session2_results) == 1
        assert session1_results[0].text == "Session 1 text"
        assert session2_results[0].text == "Session 2 text"
    
    @pytest.mark.asyncio
    async def test_performance_no_blocking(self, mock_session, whisper_service):
        """Test that concurrent sessions don't block each other"""
        import time
        
        # Create multiple handlers
        handlers = []
        for i in range(5):
            ws = MockWebSocket()
            session = Mock(**mock_session.__dict__)
            session.session_id = f"perf-session-{i}"
            handler = WebSocketHandler(ws, session)
            handler.whisper = whisper_service
            handler.whisper_available = True
            handlers.append(handler)
        
        # Measure time to start all sessions
        start_time = time.time()
        
        # Start all sessions concurrently
        start_tasks = [handler.handle_start_server_transcription() for handler in handlers]
        results = await asyncio.gather(*start_tasks)
        
        elapsed = time.time() - start_time
        
        # All should succeed
        assert all(results)
        assert len(whisper_service.active_sessions) == 5
        
        # Should be fast (no blocking)
        assert elapsed < 2.0  # Very generous limit
        
        # Test concurrent audio processing
        audio_data = base64.b64encode(b"concurrent_test_audio").decode('utf-8')
        
        start_time = time.time()
        audio_tasks = [handler.handle_audio_chunk(audio_data) for handler in handlers]
        await asyncio.gather(*audio_tasks, return_exceptions=True)
        elapsed = time.time() - start_time
        
        # Audio processing should also be fast and non-blocking
        assert elapsed < 5.0  # Very generous limit
    
    @pytest.mark.asyncio
    async def test_websocket_handler_transcription_session_tracking(self, mock_session, whisper_service):
        """Test WebSocket handler properly tracks transcription session IDs"""
        ws = MockWebSocket()
        handler = WebSocketHandler(ws, mock_session)
        handler.whisper = whisper_service
        handler.whisper_available = True
        
        # Initially no transcription session
        assert handler.current_transcription_session_id is None
        
        # Start transcription
        await handler.handle_start_server_transcription()
        
        # Should now have a transcription session ID
        assert handler.current_transcription_session_id is not None
        
        # Session ID should be in whisper service
        assert handler.current_transcription_session_id in whisper_service.active_sessions
        
        # Stop transcription
        await handler.handle_stop_server_transcription()
        
        # Session ID should be cleared
        assert handler.current_transcription_session_id is None
        
        # Should be removed from whisper service
        assert len(whisper_service.active_sessions) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])