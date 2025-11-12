"""
Unit tests for SessionManager
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timedelta
from pathlib import Path

from src.api.session_manager import (
    SessionManager, 
    Session, 
    SessionConfig, 
    SessionMetrics,
    SessionHealth,
    CleanupProgress,
    CleanupStage
)


class TestSessionManager:
    """Test SessionManager functionality"""
    
    @pytest.fixture
    def session_manager(self):
        """Create SessionManager instance for testing"""
        return SessionManager(max_sessions=3, session_timeout=300)
    
    @pytest.mark.asyncio
    async def test_session_creation(self, session_manager):
        """Test creating a new session"""
        with patch('src.api.session_manager.ClaudeCodeClient') as mock_client, \
             patch('src.api.session_manager.ConversationManager') as mock_conv:
            
            # Mock the Claude client
            mock_claude_instance = Mock()
            mock_claude_instance._start_persistent_claude = AsyncMock()
            mock_client.return_value = mock_claude_instance
            
            # Mock conversation manager
            mock_conv_instance = Mock()
            mock_conv.return_value = mock_conv_instance
            
            session = await session_manager.create_session(
                working_directory=Path("/test"),
                allowed_tools=["Bash", "Read"],
                permission_mode="bypassPermissions"
            )
            
            assert session is not None
            assert session.session_id is not None
            assert len(session.session_id) == 12  # UUID hex truncated
            assert session.config.working_directory == Path("/test")
            assert "Bash" in session.config.allowed_tools
            assert session_manager.sessions[session.session_id] == session
            
            # Verify Claude process was started
            mock_claude_instance._start_persistent_claude.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_max_sessions_limit(self, session_manager):
        """Test session limit enforcement"""
        with patch('src.api.session_manager.ClaudeCodeClient') as mock_client, \
             patch('src.api.session_manager.ConversationManager') as mock_conv:
            
            mock_claude_instance = Mock()
            mock_claude_instance._start_persistent_claude = AsyncMock()
            mock_client.return_value = mock_claude_instance
            mock_conv.return_value = Mock()
            
            # Create maximum allowed sessions
            sessions = []
            for i in range(session_manager.max_sessions):
                session = await session_manager.create_session()
                sessions.append(session)
            
            assert len(session_manager.sessions) == session_manager.max_sessions
            
            # Creating one more should remove oldest session
            oldest_session_id = sessions[0].session_id
            new_session = await session_manager.create_session()
            
            assert len(session_manager.sessions) == session_manager.max_sessions
            assert oldest_session_id not in session_manager.sessions
            assert new_session.session_id in session_manager.sessions
    
    def test_get_session(self, session_manager):
        """Test getting session by ID"""
        # Create mock session
        session = Mock()
        session.session_id = "test-123"
        session.last_activity = datetime.now()
        session_manager.sessions["test-123"] = session
        
        retrieved = session_manager.get_session("test-123")
        assert retrieved == session
        
        # Test non-existent session
        assert session_manager.get_session("nonexistent") is None
    
    @pytest.mark.asyncio
    async def test_delete_session(self, session_manager):
        """Test deleting a session"""
        # Create mock session with cleanup method
        mock_session = Mock()
        mock_session.claude_client.cleanup = AsyncMock()
        session_manager.sessions["test-session"] = mock_session
        
        success = await session_manager.delete_session("test-session")
        assert success is True
        assert "test-session" not in session_manager.sessions
        mock_session.claude_client.cleanup.assert_called_once()
        
        # Test deleting non-existent session
        success = await session_manager.delete_session("nonexistent")
        assert success is False
    
    def test_list_sessions(self, session_manager):
        """Test listing all sessions"""
        # Create mock sessions
        session1 = Mock()
        session1.session_id = "session-1"
        session1.conversation.conversation_id = "conv-1"
        session1.config.working_directory = Path("/path1")
        session1.created_at = datetime.now()
        session1.last_activity = datetime.now()
        
        session2 = Mock()
        session2.session_id = "session-2"
        session2.conversation.conversation_id = "conv-2"
        session2.config.working_directory = Path("/path2")
        session2.created_at = datetime.now()
        session2.last_activity = datetime.now()
        
        session_manager.sessions["session-1"] = session1
        session_manager.sessions["session-2"] = session2
        
        session_list = session_manager.list_sessions()
        assert len(session_list) == 2
        assert session_list[0]["session_id"] == "session-1"
        assert session_list[1]["session_id"] == "session-2"
    
    @pytest.mark.asyncio
    async def test_session_health_monitoring(self, session_manager):
        """Test session health monitoring"""
        # Create mock session with metrics
        session = Mock()
        session.metrics = SessionMetrics()
        session.claude_client.claude_process = Mock()
        session.claude_client.claude_process.pid = 12345
        session_manager.sessions["test"] = session
        
        with patch('src.api.session_manager.psutil.Process') as mock_process:
            mock_proc = Mock()
            mock_proc.memory_info.return_value.rss = 100 * 1024 * 1024  # 100MB
            mock_proc.cpu_percent.return_value = 25.0
            mock_proc.status.return_value = "running"
            mock_process.return_value = mock_proc
            
            await session_manager._check_session_health(session)
            
            assert session.metrics.subprocess_pid == 12345
            assert session.metrics.subprocess_memory_mb == 100.0
            assert session.metrics.subprocess_cpu_percent == 25.0
            assert session.metrics.health_status == SessionHealth.HEALTHY
    
    @pytest.mark.asyncio
    async def test_session_health_critical_memory(self, session_manager):
        """Test session marked as critical for high memory usage"""
        session = Mock()
        session.metrics = SessionMetrics()
        session.claude_client.claude_process = Mock()
        session.claude_client.claude_process.pid = 12345
        session_manager.sessions["test"] = session
        
        with patch('src.api.session_manager.psutil.Process') as mock_process:
            mock_proc = Mock()
            # Set memory usage above limit (500MB limit, set to 600MB)
            mock_proc.memory_info.return_value.rss = 600 * 1024 * 1024
            mock_proc.cpu_percent.return_value = 10.0
            mock_proc.status.return_value = "running"
            mock_process.return_value = mock_proc
            
            await session_manager._check_session_health(session)
            
            assert session.metrics.health_status == SessionHealth.CRITICAL
    
    def test_get_system_health(self, session_manager):
        """Test system health status"""
        # Create sessions with different health statuses
        healthy_session = Mock()
        healthy_session.metrics = Mock()
        healthy_session.metrics.health_status = SessionHealth.HEALTHY
        
        degraded_session = Mock()
        degraded_session.metrics = Mock()
        degraded_session.metrics.health_status = SessionHealth.DEGRADED
        
        critical_session = Mock()
        critical_session.metrics = Mock()
        critical_session.metrics.health_status = SessionHealth.CRITICAL
        
        session_manager.sessions["healthy"] = healthy_session
        session_manager.sessions["degraded"] = degraded_session
        session_manager.sessions["critical"] = critical_session
        
        with patch('src.api.session_manager.psutil.virtual_memory') as mock_mem, \
             patch('src.api.session_manager.psutil.cpu_percent') as mock_cpu:
            
            mock_mem.return_value.percent = 45.0
            mock_mem.return_value.available = 8 * 1024 * 1024 * 1024  # 8GB
            mock_cpu.return_value = 25.0
            
            health = session_manager.get_system_health()
            
            assert health["total_sessions"] == 3
            assert health["session_health"]["healthy"] == 1
            assert health["session_health"]["degraded"] == 1
            assert health["session_health"]["critical"] == 1
            assert health["system_resources"]["memory_percent"] == 45.0
            assert health["system_resources"]["cpu_percent"] == 25.0
    
    def test_request_timing(self, session_manager):
        """Test request timing functionality"""
        # Create session with metrics
        session = Mock()
        session.metrics = SessionMetrics()
        session._request_start_time = None
        session_manager.sessions["test"] = session
        
        # Start timing
        session_manager.start_request_timing("test")
        assert session._request_start_time is not None
        
        # End timing
        import time
        time.sleep(0.01)  # Small delay
        session_manager.end_request_timing("test", success=True)
        
        assert session.metrics.total_requests == 1
        assert session.metrics.failed_requests == 0
        assert session.metrics.last_response_time_ms > 0
        assert session.metrics.avg_response_time_ms > 0
        
        # Test failed request
        session_manager.start_request_timing("test")
        session_manager.end_request_timing("test", success=False)
        
        assert session.metrics.total_requests == 2
        assert session.metrics.failed_requests == 1
        assert session.metrics.consecutive_failures == 1
    
    @pytest.mark.asyncio
    async def test_cleanup_with_progress(self, session_manager):
        """Test session cleanup with progress tracking"""
        # Create mock session
        mock_session = Mock()
        mock_session.claude_client = Mock()
        mock_session.claude_client.cleanup = AsyncMock()
        mock_session.websocket = None
        session_manager.sessions["cleanup-test"] = mock_session
        
        progress = await session_manager.delete_session_with_progress("cleanup-test")
        
        assert progress is not None
        assert progress.session_id == "cleanup-test"
        assert progress.stage == CleanupStage.COMPLETED
        assert progress.progress_percent == 100.0
        assert "cleanup-test" not in session_manager.sessions
    
    @pytest.mark.asyncio
    async def test_health_monitoring_loop(self, session_manager):
        """Test health monitoring background task"""
        # Start health monitoring
        assert session_manager.health_check_task is not None
        
        # Stop health monitoring
        await session_manager.stop_health_monitoring()
        assert session_manager.health_check_task.done()


class TestSessionConfig:
    """Test SessionConfig data class"""
    
    def test_config_creation(self):
        """Test session configuration creation"""
        config = SessionConfig(
            working_directory=Path("/test"),
            allowed_tools=["Bash", "Read"],
            permission_mode="bypassPermissions",
            api_key="test-key",
            conversations_dir=Path("/conversations")
        )
        
        assert config.working_directory == Path("/test")
        assert config.allowed_tools == ["Bash", "Read"]
        assert config.permission_mode == "bypassPermissions"
        assert config.api_key == "test-key"


class TestSessionMetrics:
    """Test SessionMetrics data class"""
    
    def test_metrics_initialization(self):
        """Test metrics initialization with defaults"""
        metrics = SessionMetrics()
        
        assert metrics.memory_usage_mb == 0.0
        assert metrics.cpu_percent == 0.0
        assert metrics.total_requests == 0
        assert metrics.health_status == SessionHealth.HEALTHY
        assert metrics.websocket_connected is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])