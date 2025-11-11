"""Session manager for handling multiple concurrent sessions"""

import os
import psutil
import uuid
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Optional, List, Any
from dataclasses import dataclass, field
from enum import Enum

from src.voice_assistant.claude.client import ClaudeCodeClient
from src.voice_assistant.claude.conversation import ConversationManager

log = logging.getLogger(__name__)


class SessionHealth(Enum):
    """Session health status"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    UNRESPONSIVE = "unresponsive"


class CleanupStage(Enum):
    """Cleanup operation stages"""
    STARTING = "starting"
    STOPPING_SUBPROCESS = "stopping_subprocess"
    CLEANING_RESOURCES = "cleaning_resources"
    REMOVING_FILES = "removing_files"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class SessionMetrics:
    """Session performance and health metrics"""
    # Resource usage
    memory_usage_mb: float = 0.0
    cpu_percent: float = 0.0
    subprocess_pid: Optional[int] = None
    subprocess_memory_mb: float = 0.0
    subprocess_cpu_percent: float = 0.0
    
    # Performance metrics  
    total_requests: int = 0
    failed_requests: int = 0
    avg_response_time_ms: float = 0.0
    last_response_time_ms: float = 0.0
    
    # Health indicators
    health_status: SessionHealth = SessionHealth.HEALTHY
    last_health_check: datetime = field(default_factory=datetime.now)
    consecutive_failures: int = 0
    
    # Connection metrics
    websocket_connected: bool = False
    last_websocket_activity: Optional[datetime] = None
    websocket_errors: int = 0


@dataclass
class CleanupProgress:
    """Track cleanup operation progress"""
    session_id: str
    stage: CleanupStage = CleanupStage.STARTING
    progress_percent: float = 0.0
    current_operation: str = ""
    errors: List[str] = field(default_factory=list)
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None


@dataclass
class SessionConfig:
    """Session configuration"""
    working_directory: Path
    allowed_tools: List[str]
    permission_mode: str
    api_key: str
    conversations_dir: Path


@dataclass
class Session:
    """Active session state"""
    session_id: str
    config: SessionConfig
    claude_client: ClaudeCodeClient
    conversation: ConversationManager
    created_at: datetime = field(default_factory=datetime.now)
    last_activity: datetime = field(default_factory=datetime.now)
    websocket: Optional[object] = None
    
    # Health and metrics tracking
    metrics: SessionMetrics = field(default_factory=SessionMetrics)
    cleanup_progress: Optional[CleanupProgress] = None
    
    # Request timing tracking
    _request_start_time: Optional[datetime] = None


class SessionManager:
    """Manage multiple concurrent user sessions"""

    def __init__(self, max_sessions: int = 10, session_timeout: int = 3600):
        """
        Initialize session manager

        Args:
            max_sessions: Maximum number of concurrent sessions
            session_timeout: Session timeout in seconds
        """
        self.max_sessions = max_sessions
        self.session_timeout = session_timeout
        self.sessions: Dict[str, Session] = {}
        
        # Health monitoring
        self.health_check_interval = 30  # seconds
        self.health_check_task: Optional[asyncio.Task] = None
        
        # Cleanup tracking
        self.active_cleanups: Dict[str, CleanupProgress] = {}
        
        # Resource limits
        self.max_memory_mb_per_session = 500  # MB
        self.max_cpu_percent_per_session = 50  # %
        
        log.info(f"Session manager initialized (max_sessions: {max_sessions}, timeout: {session_timeout}s)")
        
        # Start health monitoring background task
        self._start_health_monitoring()

    async def create_session(
        self,
        working_directory: Optional[Path] = None,
        allowed_tools: Optional[List[str]] = None,
        permission_mode: Optional[str] = None,
    ) -> Session:
        """
        Create a new session

        Args:
            working_directory: Working directory for Claude operations
            allowed_tools: Override allowed tools list
            permission_mode: Permission mode

        Returns:
            Session object
        """
        # Check session limit
        if len(self.sessions) >= self.max_sessions:
            # Try to cleanup old sessions
            self._cleanup_inactive_sessions()
            if len(self.sessions) >= self.max_sessions:
                # Remove oldest session to make room
                oldest_session_id = min(self.sessions.keys(), 
                                      key=lambda sid: self.sessions[sid].created_at)
                log.info(f"Removing oldest session {oldest_session_id} to make room for new session")
                await self.delete_session(oldest_session_id)

        # Generate session ID
        session_id = uuid.uuid4().hex[:12]

        # Set defaults
        if not working_directory:
            working_directory = Path("/app/workspace")

        if not allowed_tools:
            allowed_tools = [
                "Bash", "Read", "Edit", "Write", "Glob", "Grep"
            ]

        if not permission_mode:
            permission_mode = "bypassPermissions"

        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        conversations_dir = Path("/app/data/conversations")

        # Create configuration
        config = SessionConfig(
            working_directory=Path(working_directory),
            allowed_tools=allowed_tools,
            permission_mode=permission_mode,
            api_key=api_key,
            conversations_dir=conversations_dir
        )

        # Initialize Claude client
        claude_client = ClaudeCodeClient(
            working_directory=config.working_directory,
            allowed_tools=config.allowed_tools,
            permission_mode=config.permission_mode,
            anthropic_api_key=config.api_key,
        )

        # Initialize conversation manager
        conversation = ConversationManager(
            conversations_dir=config.conversations_dir,
            conversation_id=None,  # Auto-generate
        )

        # Create session
        session = Session(
            session_id=session_id,
            config=config,
            claude_client=claude_client,
            conversation=conversation,
        )

        self.sessions[session_id] = session
        log.info(f"Created session {session_id} (total: {len(self.sessions)})")

        # Start Claude process immediately
        log.info(f"Starting Claude process for session {session_id}")
        await claude_client._start_persistent_claude()
        log.info(f"Claude process ready for session {session_id}")

        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID"""
        session = self.sessions.get(session_id)
        if session:
            session.last_activity = datetime.now()
        return session

    async def delete_session(self, session_id: str) -> bool:
        """
        Delete a session

        Args:
            session_id: Session ID to delete

        Returns:
            True if deleted, False if not found
        """
        session = self.sessions.pop(session_id, None)
        if session:
            # Cleanup Claude client
            if hasattr(session.claude_client, 'cleanup'):
                await session.claude_client.cleanup()
            log.info(f"Deleted session {session_id} (remaining: {len(self.sessions)})")
            return True
        return False

    def list_sessions(self) -> List[Dict[str, any]]:
        """List all active sessions"""
        return [
            {
                "session_id": session.session_id,
                "conversation_id": session.conversation.conversation_id,
                "working_directory": str(session.config.working_directory),
                "created_at": session.created_at.isoformat(),
                "last_activity": session.last_activity.isoformat(),
            }
            for session in self.sessions.values()
        ]

    async def _cleanup_inactive_sessions(self):
        """Remove sessions that have been inactive"""
        now = datetime.now()
        to_remove = []

        for session_id, session in self.sessions.items():
            inactive_seconds = (now - session.last_activity).total_seconds()
            if inactive_seconds > self.session_timeout:
                to_remove.append(session_id)

        for session_id in to_remove:
            log.info(f"Removing inactive session {session_id}")
            await self.delete_session(session_id)

    async def update_session_config(
        self,
        session_id: str,
        working_directory: Optional[Path] = None,
        allowed_tools: Optional[List[str]] = None,
        permission_mode: Optional[str] = None,
    ) -> bool:
        """
        Update session configuration

        Args:
            session_id: Session ID
            working_directory: New working directory
            allowed_tools: New allowed tools list
            permission_mode: New permission mode

        Returns:
            True if updated, False if session not found
        """
        session = self.get_session(session_id)
        if not session:
            return False

        # Update config
        if working_directory:
            session.config.working_directory = Path(working_directory)

        if allowed_tools:
            session.config.allowed_tools = allowed_tools

        if permission_mode:
            session.config.permission_mode = permission_mode

        # Recreate Claude client with new config
        await session.claude_client.cleanup()
        session.claude_client = ClaudeCodeClient(
            working_directory=session.config.working_directory,
            allowed_tools=session.config.allowed_tools,
            permission_mode=session.config.permission_mode,
            anthropic_api_key=session.config.api_key,
        )

        log.info(f"Updated configuration for session {session_id}")
        return True
    
    def _start_health_monitoring(self):
        """Start the background health monitoring task"""
        if self.health_check_task is None or self.health_check_task.done():
            self.health_check_task = asyncio.create_task(self._health_monitoring_loop())
            log.info("Started session health monitoring")
    
    async def _health_monitoring_loop(self):
        """Background task to monitor session health"""
        while True:
            try:
                await self._check_all_session_health()
                await asyncio.sleep(self.health_check_interval)
            except asyncio.CancelledError:
                log.info("Health monitoring cancelled")
                break
            except Exception as e:
                log.error(f"Error in health monitoring loop: {e}")
                await asyncio.sleep(5)  # Brief pause before retry
    
    async def _check_all_session_health(self):
        """Check health of all active sessions"""
        for session_id, session in list(self.sessions.items()):
            try:
                await self._check_session_health(session)
                await self._check_resource_limits(session)
            except Exception as e:
                log.error(f"Error checking health for session {session_id}: {e}")
                session.metrics.consecutive_failures += 1
                if session.metrics.consecutive_failures >= 3:
                    session.metrics.health_status = SessionHealth.CRITICAL
    
    async def _check_session_health(self, session: Session):
        """Check individual session health and update metrics"""
        now = datetime.now()
        session.metrics.last_health_check = now
        
        # Check subprocess status
        if session.claude_client.claude_process:
            try:
                pid = session.claude_client.claude_process.pid
                process = psutil.Process(pid)
                
                # Update subprocess metrics
                session.metrics.subprocess_pid = pid
                session.metrics.subprocess_memory_mb = process.memory_info().rss / 1024 / 1024
                session.metrics.subprocess_cpu_percent = process.cpu_percent()
                
                # Check if process is responsive
                if process.status() == psutil.STATUS_ZOMBIE:
                    session.metrics.health_status = SessionHealth.UNRESPONSIVE
                elif session.metrics.subprocess_memory_mb > self.max_memory_mb_per_session:
                    session.metrics.health_status = SessionHealth.CRITICAL
                elif session.metrics.subprocess_cpu_percent > self.max_cpu_percent_per_session:
                    session.metrics.health_status = SessionHealth.DEGRADED
                else:
                    session.metrics.health_status = SessionHealth.HEALTHY
                    session.metrics.consecutive_failures = 0
                    
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                session.metrics.subprocess_pid = None
                session.metrics.health_status = SessionHealth.UNRESPONSIVE
        
        # Check WebSocket connection health
        if session.websocket:
            session.metrics.websocket_connected = True
            session.metrics.last_websocket_activity = session.last_activity
        else:
            session.metrics.websocket_connected = False
            
        # Check session age and activity
        inactive_time = (now - session.last_activity).total_seconds()
        if inactive_time > self.session_timeout * 0.8:  # 80% of timeout
            if session.metrics.health_status == SessionHealth.HEALTHY:
                session.metrics.health_status = SessionHealth.DEGRADED
    
    async def _check_resource_limits(self, session: Session):
        """Check if session exceeds resource limits and take action"""
        if session.metrics.health_status == SessionHealth.CRITICAL:
            if session.metrics.subprocess_memory_mb > self.max_memory_mb_per_session * 1.5:
                log.warning(f"Session {session.session_id} exceeds memory limit, forcing cleanup")
                await self.delete_session_with_progress(session.session_id, force=True)
            elif session.metrics.consecutive_failures >= 5:
                log.warning(f"Session {session.session_id} has too many failures, forcing cleanup")
                await self.delete_session_with_progress(session.session_id, force=True)
    
    def get_session_health(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed health information for a session"""
        session = self.sessions.get(session_id)
        if not session:
            return None
            
        return {
            "session_id": session_id,
            "health_status": session.metrics.health_status.value,
            "last_health_check": session.metrics.last_health_check.isoformat(),
            "resource_usage": {
                "memory_mb": session.metrics.memory_usage_mb,
                "cpu_percent": session.metrics.cpu_percent,
                "subprocess_memory_mb": session.metrics.subprocess_memory_mb,
                "subprocess_cpu_percent": session.metrics.subprocess_cpu_percent,
                "subprocess_pid": session.metrics.subprocess_pid
            },
            "performance": {
                "total_requests": session.metrics.total_requests,
                "failed_requests": session.metrics.failed_requests,
                "success_rate": (
                    (session.metrics.total_requests - session.metrics.failed_requests) / 
                    session.metrics.total_requests * 100 
                    if session.metrics.total_requests > 0 else 100
                ),
                "avg_response_time_ms": session.metrics.avg_response_time_ms,
                "last_response_time_ms": session.metrics.last_response_time_ms
            },
            "connection": {
                "websocket_connected": session.metrics.websocket_connected,
                "last_websocket_activity": (
                    session.metrics.last_websocket_activity.isoformat() 
                    if session.metrics.last_websocket_activity else None
                ),
                "websocket_errors": session.metrics.websocket_errors
            },
            "limits": {
                "max_memory_mb": self.max_memory_mb_per_session,
                "max_cpu_percent": self.max_cpu_percent_per_session
            }
        }
    
    def get_system_health(self) -> Dict[str, Any]:
        """Get overall system health status"""
        total_sessions = len(self.sessions)
        healthy_sessions = sum(1 for s in self.sessions.values() 
                              if s.metrics.health_status == SessionHealth.HEALTHY)
        degraded_sessions = sum(1 for s in self.sessions.values() 
                               if s.metrics.health_status == SessionHealth.DEGRADED)
        critical_sessions = sum(1 for s in self.sessions.values() 
                               if s.metrics.health_status == SessionHealth.CRITICAL)
        unresponsive_sessions = sum(1 for s in self.sessions.values() 
                                   if s.metrics.health_status == SessionHealth.UNRESPONSIVE)
        
        # System resource usage
        system_memory = psutil.virtual_memory()
        system_cpu = psutil.cpu_percent(interval=0.1)
        
        return {
            "total_sessions": total_sessions,
            "max_sessions": self.max_sessions,
            "session_health": {
                "healthy": healthy_sessions,
                "degraded": degraded_sessions,
                "critical": critical_sessions,
                "unresponsive": unresponsive_sessions
            },
            "system_resources": {
                "memory_percent": system_memory.percent,
                "memory_available_mb": system_memory.available / 1024 / 1024,
                "cpu_percent": system_cpu
            },
            "active_cleanups": len(self.active_cleanups),
            "health_check_interval": self.health_check_interval
        }
    
    def start_request_timing(self, session_id: str):
        """Mark the start of a request for performance tracking"""
        session = self.sessions.get(session_id)
        if session:
            session._request_start_time = datetime.now()
    
    def end_request_timing(self, session_id: str, success: bool = True):
        """Mark the end of a request and update performance metrics"""
        session = self.sessions.get(session_id)
        if session and session._request_start_time:
            end_time = datetime.now()
            response_time = (end_time - session._request_start_time).total_seconds() * 1000
            
            # Update metrics
            session.metrics.total_requests += 1
            if not success:
                session.metrics.failed_requests += 1
                session.metrics.consecutive_failures += 1
            else:
                session.metrics.consecutive_failures = 0
            
            # Update response time averages
            session.metrics.last_response_time_ms = response_time
            if session.metrics.avg_response_time_ms == 0:
                session.metrics.avg_response_time_ms = response_time
            else:
                # Simple moving average
                session.metrics.avg_response_time_ms = (
                    session.metrics.avg_response_time_ms * 0.9 + response_time * 0.1
                )
            
            session._request_start_time = None

    async def delete_session_with_progress(self, session_id: str, force: bool = False) -> Optional[CleanupProgress]:
        """
        Delete a session with detailed progress tracking
        
        Args:
            session_id: Session ID to delete
            force: If True, forcibly kill processes without graceful shutdown
            
        Returns:
            CleanupProgress object to track the operation
        """
        session = self.sessions.get(session_id)
        if not session:
            return None
            
        # Create cleanup progress tracker
        progress = CleanupProgress(session_id=session_id)
        self.active_cleanups[session_id] = progress
        
        try:
            # Stage 1: Starting cleanup
            progress.stage = CleanupStage.STARTING
            progress.current_operation = "Initializing cleanup process"
            progress.progress_percent = 10.0
            log.info(f"Starting {'forced' if force else 'graceful'} cleanup for session {session_id}")
            
            # Stage 2: Stop subprocess
            progress.stage = CleanupStage.STOPPING_SUBPROCESS
            progress.current_operation = "Stopping Claude subprocess"
            progress.progress_percent = 30.0
            
            if session.claude_client:
                try:
                    if force:
                        # Force kill subprocess immediately
                        if session.claude_client.claude_process:
                            try:
                                session.claude_client.claude_process.kill()
                                await asyncio.wait_for(session.claude_client.claude_process.wait(), timeout=2)
                            except asyncio.TimeoutError:
                                log.warning(f"Force kill timed out for session {session_id}")
                    else:
                        # Graceful cleanup with timeout
                        try:
                            await asyncio.wait_for(session.claude_client.cleanup(), timeout=10)
                        except asyncio.TimeoutError:
                            log.warning(f"Graceful cleanup timed out for session {session_id}, forcing kill")
                            if session.claude_client.claude_process:
                                session.claude_client.claude_process.kill()
                                await session.claude_client.claude_process.wait()
                except Exception as e:
                    error_msg = f"Error stopping subprocess: {str(e)}"
                    progress.errors.append(error_msg)
                    log.error(error_msg)
            
            progress.progress_percent = 60.0
            
            # Stage 3: Clean resources
            progress.stage = CleanupStage.CLEANING_RESOURCES
            progress.current_operation = "Cleaning up session resources"
            progress.progress_percent = 80.0
            
            # Close WebSocket if connected
            if session.websocket:
                try:
                    # Note: WebSocket cleanup handled by WebSocket handler
                    session.websocket = None
                except Exception as e:
                    error_msg = f"Error cleaning WebSocket: {str(e)}"
                    progress.errors.append(error_msg)
                    log.warning(error_msg)
            
            # Stage 4: Remove from sessions
            progress.current_operation = "Removing session from registry"
            progress.progress_percent = 90.0
            
            self.sessions.pop(session_id, None)
            
            # Stage 5: Completed
            progress.stage = CleanupStage.COMPLETED
            progress.current_operation = "Cleanup completed successfully"
            progress.progress_percent = 100.0
            progress.completed_at = datetime.now()
            
            log.info(f"Session {session_id} cleanup completed (errors: {len(progress.errors)})")
            return progress
            
        except Exception as e:
            # Mark as failed
            progress.stage = CleanupStage.FAILED
            progress.current_operation = f"Cleanup failed: {str(e)}"
            progress.errors.append(f"Fatal error: {str(e)}")
            progress.completed_at = datetime.now()
            log.error(f"Session {session_id} cleanup failed: {e}")
            return progress
            
        finally:
            # Keep cleanup record for a short time for status queries
            asyncio.create_task(self._remove_cleanup_record(session_id, delay=30))
    
    async def _remove_cleanup_record(self, session_id: str, delay: int = 30):
        """Remove cleanup record after delay"""
        await asyncio.sleep(delay)
        self.active_cleanups.pop(session_id, None)
    
    def get_cleanup_progress(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get cleanup progress for a session"""
        progress = self.active_cleanups.get(session_id)
        if not progress:
            return None
            
        return {
            "session_id": progress.session_id,
            "stage": progress.stage.value,
            "progress_percent": progress.progress_percent,
            "current_operation": progress.current_operation,
            "errors": progress.errors,
            "started_at": progress.started_at.isoformat(),
            "completed_at": progress.completed_at.isoformat() if progress.completed_at else None,
            "duration_seconds": (
                (progress.completed_at or datetime.now()) - progress.started_at
            ).total_seconds()
        }

    async def stop_health_monitoring(self):
        """Stop the health monitoring background task"""
        if self.health_check_task and not self.health_check_task.done():
            self.health_check_task.cancel()
            try:
                await self.health_check_task
            except asyncio.CancelledError:
                pass
            log.info("Stopped session health monitoring")
