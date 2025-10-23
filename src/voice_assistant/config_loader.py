"""Configuration file loader for YAML-based configs"""

import yaml
from pathlib import Path
from typing import Dict, Any, List
import logging

log = logging.getLogger(__name__)


def load_tool_allowlist(profile_name: str = "full") -> Dict[str, Any]:
    """
    Load a tool allowlist configuration from YAML file

    Args:
        profile_name: Name of the profile (safe, coding, full)

    Returns:
        Dict containing allowed_tools list and permission_mode
    """
    # Find config file
    config_dir = Path(__file__).parent.parent.parent / "config" / "tool_allowlists"
    config_file = config_dir / f"{profile_name}.yml"

    if not config_file.exists():
        log.warning(f"Tool allowlist config not found: {config_file}, using defaults")
        return {
            "allowed_tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
            "permission_mode": "bypassPermissions"
        }

    try:
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)

        return {
            "allowed_tools": config.get("allowed_tools", []),
            "permission_mode": config.get("permission_mode", "bypassPermissions"),
            "description": config.get("description", ""),
            "use_cases": config.get("use_cases", [])
        }

    except Exception as e:
        log.error(f"Error loading tool allowlist config: {e}")
        return {
            "allowed_tools": ["Read", "Write", "Edit"],
            "permission_mode": "requireApproval"
        }


def list_available_profiles() -> List[str]:
    """List available tool allowlist profiles"""
    config_dir = Path(__file__).parent.parent.parent / "config" / "tool_allowlists"

    if not config_dir.exists():
        return []

    profiles = [
        f.stem for f in config_dir.glob("*.yml")
    ]

    return sorted(profiles)
