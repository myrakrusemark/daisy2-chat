"""Download token manager for secure file downloads"""

import uuid
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
import asyncio

log = logging.getLogger(__name__)


@dataclass
class DownloadToken:
    """Represents a temporary download token"""
    token: str
    file_path: Path
    session_id: str
    created_at: datetime
    expires_at: datetime
    is_directory: bool
    used: bool = False


class DownloadTokenManager:
    """Manages temporary download tokens with expiry and single-use enforcement"""

    def __init__(self, cleanup_interval: int = 300):
        """
        Initialize download token manager

        Args:
            cleanup_interval: Seconds between cleanup runs (default 5 minutes)
        """
        self.tokens: Dict[str, DownloadToken] = {}
        self.cleanup_interval = cleanup_interval
        self._cleanup_task: Optional[asyncio.Task] = None
        log.info("Download token manager initialized")

    async def start_cleanup_task(self):
        """Start background cleanup task"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            log.info("Started token cleanup task")

    async def stop_cleanup_task(self):
        """Stop background cleanup task"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
            log.info("Stopped token cleanup task")

    async def _cleanup_loop(self):
        """Background task to clean up expired tokens"""
        while True:
            try:
                await asyncio.sleep(self.cleanup_interval)
                self._cleanup_expired_tokens()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.error(f"Error in cleanup loop: {e}")

    def _cleanup_expired_tokens(self):
        """Remove expired tokens"""
        now = datetime.now()
        expired = [
            token_id for token_id, token in self.tokens.items()
            if token.expires_at < now or token.used
        ]

        for token_id in expired:
            del self.tokens[token_id]

        if expired:
            log.info(f"Cleaned up {len(expired)} expired/used tokens")

    def _validate_path(self, file_path: Path, session_working_dir: Path) -> bool:
        """
        Validate that file_path is within session working directory

        Args:
            file_path: Path to validate
            session_working_dir: Session's working directory (sandbox)

        Returns:
            True if path is safe, False otherwise
        """
        try:
            # Resolve to absolute paths
            resolved_file = file_path.resolve()
            resolved_sandbox = session_working_dir.resolve()

            # Check if file is within sandbox
            return resolved_file.is_relative_to(resolved_sandbox)
        except (ValueError, OSError) as e:
            log.warning(f"Path validation error: {e}")
            return False

    def create_token(
        self,
        file_path: str | Path,
        session_id: str,
        session_working_dir: Path,
        expiry_minutes: int = 5,
        max_size_mb: Optional[int] = 100,
    ) -> Optional[str]:
        """
        Create a download token for a file or directory

        Args:
            file_path: Path to file or directory (relative to session working dir)
            session_id: Session ID that owns this file
            session_working_dir: Session's working directory (sandbox)
            expiry_minutes: Minutes until token expires (default 5)
            max_size_mb: Maximum file/directory size in MB (default 100, None for unlimited)

        Returns:
            Token string if successful, None if validation fails
        """
        # Convert to Path and make absolute relative to working dir
        path = Path(file_path)
        if not path.is_absolute():
            path = session_working_dir / path

        # Validate path is within sandbox
        if not self._validate_path(path, session_working_dir):
            log.warning(f"Path validation failed: {path} not in {session_working_dir}")
            return None

        # Check if path exists
        if not path.exists():
            log.warning(f"Path does not exist: {path}")
            return None

        # Check size if limit is set
        if max_size_mb is not None:
            size_mb = self._get_size_mb(path)
            if size_mb > max_size_mb:
                log.warning(f"Path too large: {size_mb}MB exceeds limit of {max_size_mb}MB")
                return None

        # Generate token
        token = uuid.uuid4().hex

        # Create token record
        download_token = DownloadToken(
            token=token,
            file_path=path,
            session_id=session_id,
            created_at=datetime.now(),
            expires_at=datetime.now() + timedelta(minutes=expiry_minutes),
            is_directory=path.is_dir(),
        )

        self.tokens[token] = download_token
        log.info(f"Created download token for {path} (session: {session_id}, expires in {expiry_minutes}m)")

        return token

    def get_token_info(self, token: str) -> Optional[Tuple[Path, str, bool]]:
        """
        Get token information and mark as used

        Args:
            token: Token string

        Returns:
            Tuple of (file_path, session_id, is_directory) if valid, None if invalid/expired
        """
        download_token = self.tokens.get(token)

        if not download_token:
            log.warning(f"Token not found: {token}")
            return None

        # Check if already used
        if download_token.used:
            log.warning(f"Token already used: {token}")
            return None

        # Check if expired
        if download_token.expires_at < datetime.now():
            log.warning(f"Token expired: {token}")
            del self.tokens[token]
            return None

        # Mark as used (single-use)
        download_token.used = True

        log.info(f"Token validated and marked as used: {token}")
        return (download_token.file_path, download_token.session_id, download_token.is_directory)

    def _get_size_mb(self, path: Path) -> float:
        """
        Calculate size of file or directory in MB

        Args:
            path: Path to measure

        Returns:
            Size in megabytes
        """
        if path.is_file():
            return path.stat().st_size / (1024 * 1024)
        elif path.is_dir():
            total_size = sum(
                f.stat().st_size for f in path.rglob('*') if f.is_file()
            )
            return total_size / (1024 * 1024)
        return 0

    def get_stats(self) -> Dict[str, int]:
        """Get manager statistics"""
        now = datetime.now()
        return {
            "total_tokens": len(self.tokens),
            "active_tokens": sum(
                1 for t in self.tokens.values()
                if not t.used and t.expires_at >= now
            ),
            "used_tokens": sum(1 for t in self.tokens.values() if t.used),
            "expired_tokens": sum(
                1 for t in self.tokens.values()
                if t.expires_at < now
            ),
        }
