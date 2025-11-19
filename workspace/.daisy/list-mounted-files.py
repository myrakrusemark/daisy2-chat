#!/usr/bin/env python3
"""
Script to list available mounted files from docker-compose.override.yml
"""

import os
import yaml
from pathlib import Path

def list_mounted_files():
    """Extract mounted files from docker-compose override"""
    try:
        # Path to docker-compose override file
        script_dir = Path(__file__).parent
        override_file = script_dir / "docker-compose.override.yml"
        
        if not override_file.exists():
            return "📁 No docker-compose.override.yml found"
        
        # Load and parse YAML
        with open(override_file, 'r') as f:
            config = yaml.safe_load(f)
        
        # Extract volumes from cassistant service
        volumes = config.get('services', {}).get('cassistant', {}).get('volumes', [])
        
        if not volumes:
            return "📁 No mounted volumes found"
        
        # Parse volume mappings
        mounted_files = []
        mounted_dirs = []
        
        for volume in volumes:
            if isinstance(volume, str):
                # Parse volume string format: /host/path:/container/path[:mode]
                parts = volume.split(':')
                if len(parts) >= 2:
                    host_path = parts[0].strip()
                    container_path = parts[1].strip()
                    mode = parts[2].strip() if len(parts) > 2 else "rw"
                    
                    # Extract just the workspace-relative path
                    if container_path.startswith('/app/workspace/'):
                        workspace_path = container_path[15:]  # Remove /app/workspace/ prefix
                        
                        # Determine if it's a file or directory
                        if workspace_path.endswith('/') or not '.' in Path(workspace_path).name:
                            # Likely a directory
                            mounted_dirs.append(f"📂 {workspace_path} {'(read-only)' if mode == 'ro' else ''}")
                        else:
                            # Likely a file
                            mounted_files.append(f"📄 {workspace_path} {'(read-only)' if mode == 'ro' else ''}")
        
        # Format output as HTML list (undecorated)
        all_items = []
        all_items.extend(mounted_dirs)
        all_items.extend(mounted_files)
        
        if not all_items:
            return "📁 No workspace mounts found"
        
        # Create HTML list
        list_items = [f"<li>{item}</li>" for item in all_items]
        return f"<ul style='list-style: none; padding-left: 0; margin: 0;'>{''.join(list_items)}</ul>"
        
    except Exception as e:
        return f"Error reading mounted files: {e}"

if __name__ == "__main__":
    print(list_mounted_files())