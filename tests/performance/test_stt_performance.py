"""
Performance tests for STT functionality
Tests latency, throughput, and resource usage
"""

import pytest
import asyncio
import time
import psutil
import statistics
from unittest.mock import Mock, patch, MagicMock
import threading
import gc

# Mock dependencies
import sys
from unittest import mock
sys.modules['faster_whisper'] = mock.MagicMock()
sys.modules['numpy'] = mock.MagicMock()

from src.api.whisper_service import WhisperTranscriptionService, TranscriptionResult


class PerformanceTestBase:
    """Base class for performance tests with metrics collection"""
    
    def setup_method(self):
        """Set up performance monitoring"""
        self.start_memory = psutil.virtual_memory().used
        self.start_time = time.time()
        self.cpu_samples = []
        self.memory_samples = []
        
    def teardown_method(self):
        """Clean up and report performance metrics"""
        end_time = time.time()
        end_memory = psutil.virtual_memory().used
        
        duration = end_time - self.start_time
        memory_delta = end_memory - self.start_memory
        
        print(f"\n📊 Performance Metrics:")
        print(f"   Duration: {duration:.3f}s")
        print(f"   Memory Delta: {memory_delta / 1024 / 1024:.1f}MB")
        
        if self.cpu_samples:
            print(f"   CPU Usage: {statistics.mean(self.cpu_samples):.1f}% (avg)")
            print(f"   CPU Peak: {max(self.cpu_samples):.1f}%")
        
        if self.memory_samples:
            print(f"   Memory Usage: {statistics.mean(self.memory_samples):.1f}MB (avg)")
            print(f"   Memory Peak: {max(self.memory_samples):.1f}MB")
    
    def start_monitoring(self, interval=0.1):
        """Start background monitoring of CPU and memory"""
        self.monitoring = True
        threading.Thread(target=self._monitor_resources, args=(interval,), daemon=True).start()
    
    def stop_monitoring(self):
        """Stop resource monitoring"""
        self.monitoring = False
    
    def _monitor_resources(self, interval):
        """Background resource monitoring"""
        process = psutil.Process()
        while getattr(self, 'monitoring', False):
            self.cpu_samples.append(process.cpu_percent())
            self.memory_samples.append(process.memory_info().rss / 1024 / 1024)  # MB
            time.sleep(interval)


class TestSTTLatencyPerformance(PerformanceTestBase):
    """Test STT latency and response time performance"""
    
    @pytest.fixture
    def whisper_service(self):
        """Create optimized whisper service for performance testing"""
        with patch('src.api.whisper_service.WhisperModel') as mock_model:
            mock_instance = MagicMock()
            mock_model.return_value = mock_instance
            
            # Fast mock transcription
            def fast_transcribe(audio_array, **kwargs):
                segments = [MagicMock(text=" Fast transcription result")]
                info = MagicMock()
                info.language = "en"
                info.language_probability = 0.95
                return segments, info
            
            mock_instance.transcribe.side_effect = fast_transcribe
            
            with patch('numpy.frombuffer') as mock_frombuffer:
                mock_frombuffer.return_value = mock.MagicMock(__len__=lambda: 1000)
                service = WhisperTranscriptionService()
                service.model = mock_instance
                return service
    
    @pytest.mark.asyncio
    async def test_session_startup_latency(self, whisper_service):
        """Test how quickly STT sessions can be started"""
        self.start_monitoring()
        
        startup_times = []
        
        for i in range(10):
            start_time = time.time()
            
            success = await whisper_service.start_transcription(
                session_id=f"perf-session-{i}",
                callback=Mock()
            )
            
            end_time = time.time()
            startup_time = end_time - start_time
            startup_times.append(startup_time)
            
            assert success is True
            
            # Clean up
            await whisper_service.stop_transcription(f"perf-session-{i}")
        
        self.stop_monitoring()
        
        # Performance assertions
        avg_startup = statistics.mean(startup_times)
        max_startup = max(startup_times)
        
        print(f"📈 Session Startup Performance:")
        print(f"   Average: {avg_startup * 1000:.1f}ms")
        print(f"   Maximum: {max_startup * 1000:.1f}ms")
        print(f"   95th Percentile: {statistics.quantiles(startup_times, n=20)[18] * 1000:.1f}ms")
        
        # Assertions
        assert avg_startup < 0.1  # Less than 100ms average
        assert max_startup < 0.5  # Less than 500ms maximum
    
    @pytest.mark.asyncio
    async def test_concurrent_session_startup_performance(self, whisper_service):
        """Test performance when starting multiple sessions concurrently"""
        self.start_monitoring()
        
        session_count = 20
        callbacks = [Mock() for _ in range(session_count)]
        session_ids = [f"concurrent-{i}" for i in range(session_count)]
        
        start_time = time.time()
        
        # Start all sessions concurrently
        tasks = []
        for i in range(session_count):
            task = whisper_service.start_transcription(session_ids[i], callbacks[i])
            tasks.append(task)
        
        results = await asyncio.gather(*tasks)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        self.stop_monitoring()
        
        # All sessions should start successfully
        assert all(results)
        assert len(whisper_service.active_sessions) == session_count
        
        print(f"🚀 Concurrent Startup Performance:")
        print(f"   {session_count} sessions started in {total_time:.3f}s")
        print(f"   Average per session: {total_time / session_count * 1000:.1f}ms")
        
        # Performance assertions
        assert total_time < 2.0  # Should complete in under 2 seconds
        assert total_time / session_count < 0.1  # Less than 100ms per session
        
        # Clean up
        for session_id in session_ids:
            await whisper_service.stop_transcription(session_id)
    
    @pytest.mark.asyncio
    async def test_audio_processing_latency(self, whisper_service):
        """Test audio chunk processing latency"""
        callback = Mock()
        
        await whisper_service.start_transcription("latency-test", callback)
        
        self.start_monitoring()
        
        processing_times = []
        fake_audio_sizes = [1000, 5000, 10000, 20000]  # Different audio chunk sizes
        
        for size in fake_audio_sizes:
            fake_audio = b'a' * size
            
            start_time = time.time()
            success = await whisper_service.process_audio_chunk("latency-test", fake_audio)
            end_time = time.time()
            
            processing_time = end_time - start_time
            processing_times.append(processing_time)
            
            assert success is True
        
        self.stop_monitoring()
        
        avg_processing = statistics.mean(processing_times)
        print(f"🎵 Audio Processing Latency:")
        print(f"   Average: {avg_processing * 1000:.1f}ms")
        print(f"   Range: {min(processing_times) * 1000:.1f}ms - {max(processing_times) * 1000:.1f}ms")
        
        # Should be very fast for our mocked processing
        assert avg_processing < 0.05  # Less than 50ms
        
        await whisper_service.stop_transcription("latency-test")


class TestSTTThroughputPerformance(PerformanceTestBase):
    """Test STT throughput and capacity performance"""
    
    @pytest.fixture
    def whisper_service(self):
        """Create whisper service for throughput testing"""
        with patch('src.api.whisper_service.WhisperModel') as mock_model:
            mock_instance = MagicMock()
            mock_model.return_value = mock_instance
            
            # Simulate realistic transcription timing
            def timed_transcribe(audio_array, **kwargs):
                time.sleep(0.01)  # 10ms simulated processing time
                segments = [MagicMock(text=f" Audio chunk {len(audio_array)}")]
                info = MagicMock()
                info.language = "en"
                info.language_probability = 0.95
                return segments, info
            
            mock_instance.transcribe.side_effect = timed_transcribe
            
            with patch('numpy.frombuffer') as mock_frombuffer:
                mock_frombuffer.return_value = mock.MagicMock(__len__=lambda: 1000)
                service = WhisperTranscriptionService()
                service.model = mock_instance
                return service
    
    @pytest.mark.asyncio
    async def test_maximum_concurrent_sessions(self, whisper_service):
        """Test maximum number of concurrent STT sessions"""
        self.start_monitoring()
        
        max_sessions = 50
        successful_sessions = 0
        callbacks = [Mock() for _ in range(max_sessions)]
        
        # Try to start maximum sessions
        for i in range(max_sessions):
            try:
                success = await whisper_service.start_transcription(
                    f"max-session-{i}", 
                    callbacks[i]
                )
                if success:
                    successful_sessions += 1
            except Exception as e:
                print(f"Failed at session {i}: {e}")
                break
        
        self.stop_monitoring()
        
        print(f"💪 Maximum Concurrent Sessions:")
        print(f"   Successfully started: {successful_sessions}")
        print(f"   Active sessions: {len(whisper_service.active_sessions)}")
        
        # Should handle a reasonable number of concurrent sessions
        assert successful_sessions >= 20  # At least 20 concurrent sessions
        
        # Clean up
        for i in range(successful_sessions):
            await whisper_service.stop_transcription(f"max-session-{i}")
    
    @pytest.mark.asyncio
    async def test_audio_throughput(self, whisper_service):
        """Test audio processing throughput across multiple sessions"""
        self.start_monitoring()
        
        session_count = 10
        sessions = []
        
        # Start multiple sessions
        for i in range(session_count):
            await whisper_service.start_transcription(f"throughput-{i}", Mock())
            sessions.append(f"throughput-{i}")
        
        # Process audio chunks concurrently across all sessions
        chunks_per_session = 20
        chunk_size = 5000
        fake_audio = b'a' * chunk_size
        
        start_time = time.time()
        
        # Create tasks for concurrent audio processing
        tasks = []
        for session_id in sessions:
            for chunk_num in range(chunks_per_session):
                task = whisper_service.process_audio_chunk(session_id, fake_audio)
                tasks.append(task)
        
        # Process all chunks concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        self.stop_monitoring()
        
        # Count successful processing
        successful_chunks = sum(1 for result in results if result is True)
        total_chunks = len(tasks)
        
        throughput = successful_chunks / total_time  # chunks per second
        data_throughput = (successful_chunks * chunk_size) / total_time / 1024 / 1024  # MB/s
        
        print(f"📊 Audio Throughput Performance:")
        print(f"   Total chunks processed: {successful_chunks}/{total_chunks}")
        print(f"   Processing time: {total_time:.3f}s")
        print(f"   Throughput: {throughput:.1f} chunks/sec")
        print(f"   Data throughput: {data_throughput:.2f} MB/sec")
        
        # Performance assertions
        assert successful_chunks >= total_chunks * 0.9  # At least 90% success rate
        assert throughput >= 50  # At least 50 chunks per second
        
        # Clean up
        for session_id in sessions:
            await whisper_service.stop_transcription(session_id)


class TestSTTMemoryPerformance(PerformanceTestBase):
    """Test memory usage and leak detection"""
    
    @pytest.fixture
    def whisper_service(self):
        """Create whisper service for memory testing"""
        with patch('src.api.whisper_service.WhisperModel') as mock_model:
            mock_instance = MagicMock()
            mock_model.return_value = mock_instance
            
            # Mock transcription with memory allocation
            def memory_transcribe(audio_array, **kwargs):
                # Simulate some memory usage
                dummy_data = [0] * 1000  # Small memory allocation
                segments = [MagicMock(text=f" Transcribed {len(dummy_data)} items")]
                info = MagicMock()
                return segments, info
            
            mock_instance.transcribe.side_effect = memory_transcribe
            
            with patch('numpy.frombuffer'):
                service = WhisperTranscriptionService()
                service.model = mock_instance
                return service
    
    @pytest.mark.asyncio
    async def test_memory_usage_single_session(self, whisper_service):
        """Test memory usage for a single STT session"""
        self.start_monitoring()
        
        # Baseline memory
        gc.collect()
        baseline_memory = psutil.Process().memory_info().rss
        
        # Start session and process audio
        await whisper_service.start_transcription("memory-test", Mock())
        
        # Process many audio chunks
        fake_audio = b'a' * 10000
        for i in range(100):
            await whisper_service.process_audio_chunk("memory-test", fake_audio)
        
        # Check memory after processing
        gc.collect()
        peak_memory = psutil.Process().memory_info().rss
        
        # Stop session
        await whisper_service.stop_transcription("memory-test")
        
        # Check memory after cleanup
        gc.collect()
        final_memory = psutil.Process().memory_info().rss
        
        self.stop_monitoring()
        
        memory_increase = (peak_memory - baseline_memory) / 1024 / 1024  # MB
        memory_after_cleanup = (final_memory - baseline_memory) / 1024 / 1024  # MB
        
        print(f"🧠 Memory Usage Analysis:")
        print(f"   Memory increase during processing: {memory_increase:.1f}MB")
        print(f"   Memory after cleanup: {memory_after_cleanup:.1f}MB")
        print(f"   Memory leak indicator: {memory_after_cleanup:.1f}MB")
        
        # Memory assertions
        assert memory_increase < 100  # Should not use excessive memory
        assert memory_after_cleanup < 10  # Should clean up well
    
    @pytest.mark.asyncio
    async def test_memory_leak_detection(self, whisper_service):
        """Test for memory leaks with repeated session creation/destruction"""
        self.start_monitoring()
        
        gc.collect()
        baseline_memory = psutil.Process().memory_info().rss
        
        # Repeatedly create and destroy sessions
        for cycle in range(10):
            session_ids = []
            
            # Create multiple sessions
            for i in range(5):
                session_id = f"leak-test-{cycle}-{i}"
                await whisper_service.start_transcription(session_id, Mock())
                session_ids.append(session_id)
            
            # Process some audio
            fake_audio = b'a' * 5000
            for session_id in session_ids:
                for _ in range(10):
                    await whisper_service.process_audio_chunk(session_id, fake_audio)
            
            # Clean up sessions
            for session_id in session_ids:
                await whisper_service.stop_transcription(session_id)
            
            # Force garbage collection
            gc.collect()
            
            # Check memory after each cycle
            current_memory = psutil.Process().memory_info().rss
            memory_growth = (current_memory - baseline_memory) / 1024 / 1024
            
            print(f"   Cycle {cycle + 1}: Memory growth = {memory_growth:.1f}MB")
        
        self.stop_monitoring()
        
        final_memory = psutil.Process().memory_info().rss
        total_growth = (final_memory - baseline_memory) / 1024 / 1024
        
        print(f"🔍 Memory Leak Detection:")
        print(f"   Total memory growth: {total_growth:.1f}MB")
        print(f"   Growth per cycle: {total_growth / 10:.1f}MB")
        
        # Should not have significant memory leaks
        assert total_growth < 50  # Less than 50MB total growth
        assert total_growth / 10 < 5  # Less than 5MB per cycle


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])