"""Git operations for version control and rollback functionality"""

import os
import logging
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional

log = logging.getLogger(__name__)


def check_git_status(directory: Path) -> Dict[str, Any]:
    """
    Check if a directory is a git repository

    Args:
        directory: Path to check

    Returns:
        Dict with 'initialized' boolean and 'path' string
    """
    try:
        # Check if directory exists
        if not directory.exists():
            return {
                "initialized": False,
                "path": str(directory),
                "error": "Directory does not exist"
            }

        # Run git rev-parse to check if it's a git repo
        result = subprocess.run(
            ["git", "rev-parse", "--git-dir"],
            cwd=str(directory),
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            return {
                "initialized": True,
                "path": str(directory),
                "git_dir": result.stdout.strip()
            }
        else:
            return {
                "initialized": False,
                "path": str(directory)
            }

    except subprocess.TimeoutExpired:
        log.error(f"Git status check timed out for {directory}")
        return {
            "initialized": False,
            "path": str(directory),
            "error": "Command timed out"
        }
    except Exception as e:
        log.error(f"Error checking git status: {e}")
        return {
            "initialized": False,
            "path": str(directory),
            "error": str(e)
        }


def init_git_repo(directory: Path) -> Dict[str, Any]:
    """
    Initialize a git repository in the specified directory

    Args:
        directory: Path where to initialize git

    Returns:
        Dict with 'success' boolean and 'message' string
    """
    try:
        # Check if directory exists
        if not directory.exists():
            return {
                "success": False,
                "message": f"Directory does not exist: {directory}"
            }

        # Check if already initialized
        status = check_git_status(directory)
        if status.get("initialized"):
            return {
                "success": False,
                "message": "Git repository already initialized"
            }

        # Initialize git repo
        result = subprocess.run(
            ["git", "init"],
            cwd=str(directory),
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode == 0:
            # Set initial git config
            subprocess.run(
                ["git", "config", "user.name", "Claude Assistant"],
                cwd=str(directory),
                capture_output=True,
                timeout=5
            )
            subprocess.run(
                ["git", "config", "user.email", "claude@cassistant.local"],
                cwd=str(directory),
                capture_output=True,
                timeout=5
            )

            # Create initial commit
            subprocess.run(
                ["git", "add", "."],
                cwd=str(directory),
                capture_output=True,
                timeout=10
            )
            subprocess.run(
                ["git", "commit", "-m", "Initial commit (before Claude operations)", "--allow-empty"],
                cwd=str(directory),
                capture_output=True,
                timeout=10
            )

            log.info(f"Initialized git repository at {directory}")
            return {
                "success": True,
                "message": f"Git repository initialized at {directory}"
            }
        else:
            log.error(f"Git init failed: {result.stderr}")
            return {
                "success": False,
                "message": f"Git init failed: {result.stderr}"
            }

    except subprocess.TimeoutExpired:
        log.error(f"Git init timed out for {directory}")
        return {
            "success": False,
            "message": "Git init command timed out"
        }
    except Exception as e:
        log.error(f"Error initializing git repo: {e}")
        return {
            "success": False,
            "message": str(e)
        }


def validate_path(path: Path, allowed_paths: list) -> bool:
    """
    Validate that a path is within allowed workspace paths

    Args:
        path: Path to validate
        allowed_paths: List of allowed parent paths

    Returns:
        True if path is allowed, False otherwise
    """
    path_str = str(path.resolve())
    return any(path_str.startswith(allowed) for allowed in allowed_paths)
