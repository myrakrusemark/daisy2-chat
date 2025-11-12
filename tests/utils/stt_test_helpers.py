"""
Utility functions for STT testing
"""

import asyncio
import time
from unittest.mock import Mock, MagicMock
import threading

# Mock dependencies
import sys
from unittest import mock
sys.modules['faster_whisper'] = mock.MagicMock()
sys.modules['numpy'] = mock.MagicMock()

from src.api.whisper_service import WhisperTranscriptionService, TranscriptionResult


def create_mock_whisper_service():
    """Create a mocked WhisperTranscriptionService for testing"""
    with mock.patch('src.api.whisper_service.WhisperModel') as mock_model:
        mock_instance = MagicMock()
        mock_model.return_value = mock_instance
        
        # Mock transcription behavior
        def mock_transcribe(audio_array, **kwargs):
            segments = [MagicMock(text=" Test transcription result")]
            info = MagicMock()
            info.language = "en"
            info.language_probability = 0.95
            return segments, info
        
        mock_instance.transcribe.side_effect = mock_transcribe
        
        with mock.patch('numpy.frombuffer') as mock_frombuffer:
            mock_frombuffer.return_value = mock.MagicMock(__len__=lambda: 1000)
            service = WhisperTranscriptionService()
            service.model = mock_instance
            return service


async def test_concurrent_sessions(num_sessions: int = 3, duration: float = 2.0):
    """
    Test utility for concurrent STT sessions
    
    Args:
        num_sessions: Number of concurrent sessions to test
        duration: How long to run each session (seconds)
    """
    print(f"🧪 Testing {num_sessions} concurrent STT sessions...")
    
    service = create_mock_whisper_service()
    
    # Track results from each session
    session_results = {i: [] for i in range(num_sessions)}
    
    def create_callback(session_num):
        def callback(result):
            session_results[session_num].append(result)
            print(f"   Session {session_num}: '{result.text}' (final={result.is_final})")
        return callback
    
    # Start all sessions
    session_ids = []
    start_time = time.time()
    
    for i in range(num_sessions):
        session_id = f"concurrent_test_{i}"
        callback = create_callback(i)
        
        success = await service.start_transcription(
            session_id=session_id,
            callback=callback,
            streaming_mode=True
        )
        
        if success:
            session_ids.append(session_id)
            print(f"✅ Started session {i} ({session_id})")
        else:
            print(f"❌ Failed to start session {i}")
    
    startup_time = time.time() - start_time
    print(f"   Startup time: {startup_time:.3f}s")
    
    # Simulate audio processing on all sessions
    fake_audio = b"fake_audio_data_for_testing"
    
    processing_start = time.time()
    tasks = []
    
    for session_id in session_ids:
        for chunk_num in range(5):  # 5 audio chunks per session
            task = service.process_audio_chunk(session_id, fake_audio)
            tasks.append(task)
    
    # Process all audio chunks concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)
    processing_time = time.time() - processing_start
    
    successful_chunks = sum(1 for r in results if r is True)
    print(f"   Processed {successful_chunks}/{len(tasks)} audio chunks in {processing_time:.3f}s")
    
    # Keep sessions running for specified duration
    await asyncio.sleep(duration)
    
    # Stop all sessions
    cleanup_start = time.time()
    for session_id in session_ids:
        await service.stop_transcription(session_id)
    cleanup_time = time.time() - cleanup_start
    
    print(f"   Cleanup time: {cleanup_time:.3f}s")
    
    # Verify results
    total_time = time.time() - start_time
    active_sessions = len(service.active_sessions)
    
    print(f"📊 Test Results:")
    print(f"   Total time: {total_time:.3f}s")
    print(f"   Sessions started: {len(session_ids)}/{num_sessions}")
    print(f"   Active sessions after cleanup: {active_sessions}")
    print(f"   Audio processing success rate: {successful_chunks/len(tasks)*100:.1f}%")
    
    # Check for session isolation
    for i, results in session_results.items():
        print(f"   Session {i} received {len(results)} transcription results")
    
    return {
        'sessions_started': len(session_ids),
        'total_time': total_time,
        'startup_time': startup_time,
        'processing_time': processing_time,
        'cleanup_time': cleanup_time,
        'active_sessions_after_cleanup': active_sessions,
        'audio_success_rate': successful_chunks / len(tasks) if tasks else 0,
        'session_results': session_results
    }


class PerformanceTimer:
    """Utility class for timing operations"""
    
    def __init__(self, description: str = "Operation"):
        self.description = description
        self.start_time = None
        self.end_time = None
    
    def __enter__(self):
        self.start_time = time.time()
        print(f"⏱️  Starting {self.description}...")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.time()
        duration = self.end_time - self.start_time
        print(f"✅ {self.description} completed in {duration:.3f}s")
        
        if exc_type is not None:
            print(f"❌ {self.description} failed with {exc_type.__name__}: {exc_val}")
    
    @property
    def duration(self):
        if self.start_time and self.end_time:
            return self.end_time - self.start_time
        return None


class MockWebSocketConnection:
    """Mock WebSocket connection for testing"""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.messages_sent = []
        self.messages_received = []
        self.connected = False
        self.callbacks = {}
    
    def send(self, message: dict):
        """Mock sending a message"""
        self.messages_sent.append(message)
        print(f"🔄 Session {self.session_id} sent: {message.get('type', 'unknown')}")
    
    def receive(self, message: dict):
        """Mock receiving a message"""
        self.messages_received.append(message)
        message_type = message.get('type')
        
        if message_type in self.callbacks:
            self.callbacks[message_type](message)
    
    def on(self, message_type: str, callback):
        """Register callback for message type"""
        self.callbacks[message_type] = callback
    
    def start_stt(self):
        """Start STT session"""
        self.send({
            'type': 'start_server_transcription',
            'session_id': self.session_id
        })
    
    def stop_stt(self):
        """Stop STT session"""
        self.send({
            'type': 'stop_server_transcription',
            'session_id': self.session_id
        })
    
    def send_audio(self, audio_data: bytes):
        """Send audio data"""
        import base64
        encoded_audio = base64.b64encode(audio_data).decode('utf-8')
        self.send({
            'type': 'audio_chunk',
            'data': encoded_audio
        })


def simulate_multiple_browser_sessions(num_sessions: int = 3):
    """
    Simulate multiple browser sessions for testing
    
    Returns:
        List of MockWebSocketConnection instances
    """
    sessions = []
    
    for i in range(num_sessions):
        session = MockWebSocketConnection(f"browser_session_{i}")
        
        # Set up transcription result handler
        def make_handler(session_num):
            def handle_transcription(message):
                print(f"📝 Session {session_num} received transcription: {message.get('text', '')}")
            return handle_transcription
        
        session.on('server_transcription_result', make_handler(i))
        session.connected = True
        sessions.append(session)
    
    print(f"🌐 Created {len(sessions)} mock browser sessions")
    return sessions


async def stress_test_stt_service(max_sessions: int = 20, duration: float = 5.0):
    """
    Stress test the STT service with many concurrent sessions
    
    Args:
        max_sessions: Maximum number of sessions to create
        duration: How long to run the test
    """
    print(f"💪 Stress testing with up to {max_sessions} sessions for {duration}s...")
    
    service = create_mock_whisper_service()
    active_sessions = []
    
    with PerformanceTimer("Stress test"):
        try:
            # Gradually add sessions
            for i in range(max_sessions):
                session_id = f"stress_session_{i}"
                
                success = await service.start_transcription(
                    session_id=session_id,
                    callback=lambda result: None  # No-op callback
                )
                
                if success:
                    active_sessions.append(session_id)
                    print(f"   Session {i+1}/{max_sessions} started")
                else:
                    print(f"   Failed to start session {i+1} - limit reached")
                    break
                
                # Brief pause between session starts
                await asyncio.sleep(0.01)
            
            print(f"   Successfully started {len(active_sessions)} sessions")
            
            # Send audio data to all sessions
            fake_audio = b"stress_test_audio_data"
            audio_tasks = []
            
            for session_id in active_sessions:
                for chunk in range(10):  # 10 chunks per session
                    task = service.process_audio_chunk(session_id, fake_audio)
                    audio_tasks.append(task)
            
            # Process all audio concurrently
            start_time = time.time()
            results = await asyncio.gather(*audio_tasks, return_exceptions=True)
            processing_time = time.time() - start_time
            
            successful_audio = sum(1 for r in results if r is True)
            print(f"   Processed {successful_audio}/{len(audio_tasks)} audio chunks in {processing_time:.3f}s")
            
            # Keep running for duration
            await asyncio.sleep(duration)
            
        finally:
            # Clean up all sessions
            cleanup_start = time.time()
            for session_id in active_sessions:
                await service.stop_transcription(session_id)
            cleanup_time = time.time() - cleanup_start
            
            print(f"   Cleanup time: {cleanup_time:.3f}s")
            print(f"   Final active sessions: {len(service.active_sessions)}")
    
    return {
        'max_concurrent_sessions': len(active_sessions),
        'audio_chunks_processed': len(audio_tasks),
        'processing_success_rate': successful_audio / len(audio_tasks) if audio_tasks else 0,
        'cleanup_time': cleanup_time
    }


if __name__ == "__main__":
    # Run some tests directly
    import asyncio
    
    async def main():
        print("🧪 Running STT test utilities...")
        
        # Test concurrent sessions
        await test_concurrent_sessions(num_sessions=5, duration=1.0)
        
        print("\n" + "="*50 + "\n")
        
        # Test stress scenarios
        await stress_test_stt_service(max_sessions=15, duration=2.0)
    
    asyncio.run(main())