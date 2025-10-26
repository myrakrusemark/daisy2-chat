"""MCP server for generating file download links"""

import os
import logging
from pathlib import Path
from typing import Any, Dict, List

from mcp.server.fastmcp import FastMCP

log = logging.getLogger(__name__)


class FileDownloadServer:
    """MCP server that provides tools for generating download links"""

    def __init__(self):
        """Initialize the file download MCP server"""
        self.name = "file-downloads"
        self.mcp = FastMCP(self.name)
        self._download_manager = None
        self._session_id = None
        self._working_directory = None
        self._base_url = None
        self._register_tools()

    def configure(
        self,
        download_manager,
        session_id: str,
        working_directory: Path,
        base_url: str = None
    ):
        """
        Configure the server with runtime dependencies

        Args:
            download_manager: DownloadTokenManager instance
            session_id: Current session ID
            working_directory: Session working directory
            base_url: Base URL for download links (e.g., http://localhost:8000)
        """
        self._download_manager = download_manager
        self._session_id = session_id
        self._working_directory = Path(working_directory)
        self._base_url = base_url or os.getenv("BASE_URL", "http://localhost:8000")
        log.info(f"File download server configured for session {session_id}")

    def _register_tools(self):
        """Register MCP tools"""

        @self.mcp.tool()
        def generate_download_link(
            path: str,
            expiry_minutes: int = 5,
        ) -> str:
            """
            Generate a secure, temporary download link for a file or directory.

            This creates a time-limited, single-use URL that allows downloading the specified
            file or directory (as a zip). The link expires after the specified time or after
            one download, whichever comes first.

            Args:
                path: Path to file or directory (relative to working directory or absolute)
                expiry_minutes: Minutes until link expires (default: 5, max: 60)

            Returns:
                Download URL that can be opened in a browser

            Example:
                # Generate link for a single file
                url = generate_download_link("output/report.pdf")

                # Generate link for a directory (will be zipped)
                url = generate_download_link("project/src", expiry_minutes=10)
            """
            if not self._download_manager:
                return "Error: Download manager not configured. This tool requires server configuration."

            # Validate expiry time
            if expiry_minutes < 1 or expiry_minutes > 60:
                return "Error: expiry_minutes must be between 1 and 60"

            # Create token
            token = self._download_manager.create_token(
                file_path=path,
                session_id=self._session_id,
                session_working_dir=self._working_directory,
                expiry_minutes=expiry_minutes,
            )

            if not token:
                return f"Error: Could not create download link. Please verify:\n" \
                       f"1. Path exists: {path}\n" \
                       f"2. Path is within working directory: {self._working_directory}\n" \
                       f"3. File/directory size is within limits (100MB)"

            # Generate full URL
            download_url = f"{self._base_url}/api/download/{token}"

            # Get path info for response
            full_path = Path(path)
            if not full_path.is_absolute():
                full_path = self._working_directory / path

            file_type = "directory (will be zipped)" if full_path.is_dir() else "file"

            return f"Download link generated successfully!\n\n" \
                   f"URL: {download_url}\n" \
                   f"Type: {file_type}\n" \
                   f"Expires: {expiry_minutes} minute{'s' if expiry_minutes != 1 else ''}\n" \
                   f"Note: This is a single-use link that will be invalidated after download."

        @self.mcp.tool()
        def list_download_stats() -> Dict[str, Any]:
            """
            Get statistics about active download tokens.

            Returns current information about download tokens including how many
            are active, used, or expired.

            Returns:
                Dictionary with token statistics
            """
            if not self._download_manager:
                return {"error": "Download manager not configured"}

            stats = self._download_manager.get_stats()
            return {
                "session_id": self._session_id,
                "working_directory": str(self._working_directory),
                "statistics": stats
            }

    def get_tools(self) -> List[Dict[str, Any]]:
        """Get list of available tools"""
        return [
            {
                "name": "generate_download_link",
                "description": "Generate secure download link for files or directories",
            },
            {
                "name": "list_download_stats",
                "description": "View download token statistics",
            }
        ]

    def run(self):
        """Start the MCP server"""
        self.mcp.run()

    def __repr__(self):
        return f"<FileDownloadServer session={self._session_id}>"
