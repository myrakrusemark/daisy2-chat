#!/usr/bin/env python3
"""
Standalone MCP server for file downloads

This script is designed to be invoked by Claude Code as an MCP server.
It receives configuration through environment variables and provides
download link generation tools.
"""

import os
import sys
import json
import logging
import requests
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from mcp.server.fastmcp import FastMCP

log = logging.getLogger(__name__)

# Create MCP server
mcp = FastMCP("file-downloads")


@mcp.tool()
def generate_download_link(
    path: str,
    expiry_minutes: int = 5,
) -> str:
    """
    Generate a secure, temporary download link for a file or directory.

    This creates a time-limited, single-use URL that allows downloading the specified
    file or directory (as a zip). The link expires after the specified time or after
    one download, whichever comes first.

    CRITICAL: When you receive the download URL from this tool:
    - ALWAYS include the complete URL in your response to the user
    - NEVER save the URL to a file
    - Present it directly so the user can click or copy it
    - The URL format is: http://localhost:8000/api/download/{token}

    Args:
        path: Path to file or directory (relative to working directory or absolute)
        expiry_minutes: Minutes until link expires (default: 5, max: 60)

    Returns:
        Download URL and expiry information formatted for user display

    Example:
        # Generate link for a single file
        url = generate_download_link("Shopping-List.md")

        # Generate link for a directory (will be zipped)
        url = generate_download_link("project/src", expiry_minutes=10)
    """
    # Get configuration from environment
    api_url = os.getenv("DOWNLOAD_API_URL", "http://localhost:8000")
    session_id = os.getenv("SESSION_ID")
    working_directory = os.getenv("WORKING_DIRECTORY", os.getcwd())

    # If no session ID provided, try to get the active session
    if not session_id:
        try:
            response = requests.get(f"{api_url}/api/sessions", timeout=5)
            if response.status_code == 200:
                sessions = response.json().get("sessions", [])
                if sessions:
                    # Use the most recently active session
                    sessions.sort(key=lambda s: s.get("last_activity", ""), reverse=True)
                    session_id = sessions[0]["session_id"]
                    log.info(f"Auto-detected session: {session_id}")
        except Exception as e:
            log.warning(f"Could not auto-detect session: {e}")

    if not session_id:
        return "Error: No active session found. Please ensure the server is running and has an active session."

    # Validate expiry time
    if expiry_minutes < 1 or expiry_minutes > 60:
        return "Error: expiry_minutes must be between 1 and 60"

    # Make API request to generate token
    try:
        response = requests.post(
            f"{api_url}/api/download/generate",
            json={
                "session_id": session_id,
                "file_path": path,
                "expiry_minutes": expiry_minutes,
            },
            timeout=10,
        )

        if response.status_code == 200:
            data = response.json()
            download_url = data["download_url"]
            file_type = data["file_type"]
            expires_minutes = expiry_minutes

            # Return ONLY the essential info - no saving to files!
            return (
                f"Download link ready!\n\n"
                f"🔗 URL: {download_url}\n\n"
                f"⏱️  Expires in {expires_minutes} minute{'s' if expires_minutes != 1 else ''}\n"
                f"📁 Type: {file_type}\n"
                f"⚠️  Single-use link - will be invalidated after download\n\n"
                f"IMPORTANT: Share this URL directly with the user - do NOT save it to a file!"
            )
        else:
            error_detail = response.json().get("detail", "Unknown error")
            return f"Error generating download link: {error_detail}"

    except requests.exceptions.RequestException as e:
        return f"Error communicating with server: {str(e)}"


@mcp.tool()
def list_download_stats() -> dict:
    """
    Get statistics about active download tokens.

    Returns current information about download tokens including how many
    are active, used, or expired.

    Returns:
        Dictionary with token statistics
    """
    # Get configuration from environment
    api_url = os.getenv("DOWNLOAD_API_URL", "http://localhost:8000")
    session_id = os.getenv("SESSION_ID")

    # If no session ID provided, try to get the active session
    if not session_id:
        try:
            response = requests.get(f"{api_url}/api/sessions", timeout=5)
            if response.status_code == 200:
                sessions = response.json().get("sessions", [])
                if sessions:
                    sessions.sort(key=lambda s: s.get("last_activity", ""), reverse=True)
                    session_id = sessions[0]["session_id"]
        except Exception as e:
            log.warning(f"Could not auto-detect session: {e}")

    if not session_id:
        return {"error": "No active session found"}

    # Make API request
    try:
        response = requests.get(
            f"{api_url}/api/download/stats",
            params={"session_id": session_id},
            timeout=10,
        )

        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"Server error: {response.status_code}"}

    except requests.exceptions.RequestException as e:
        return {"error": f"Communication error: {str(e)}"}


if __name__ == "__main__":
    # Run the MCP server
    mcp.run()
