#!/usr/bin/env bash

# Daisy Mount Synchronization Script
# This script creates symlinks in the workspace to match Docker container mounts
# defined in the docker-compose.override.yml file

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory and paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"
SELFHOST_DIR="$(dirname "$(dirname "$WORKSPACE_DIR")")"
OVERRIDE_FILE="$SELFHOST_DIR/docker-compose.override.yml"

echo -e "${BLUE}Daisy Mount Sync${NC}"
echo "================================"
echo "Workspace: $WORKSPACE_DIR"
echo "Override file: $OVERRIDE_FILE"
echo ""

# Check if override file exists
if [[ ! -f "$OVERRIDE_FILE" ]]; then
    echo -e "${RED}Error: docker-compose.override.yml not found at $OVERRIDE_FILE${NC}"
    exit 1
fi

# Change to workspace directory
cd "$WORKSPACE_DIR"

# Function to clean existing symlinks
clean_symlinks() {
    echo "Cleaning existing symlinks..."
    
    # Find and remove all symlinks in workspace (excluding .daisy directory)
    find . -type l ! -path "./.daisy/*" -delete
    
    # Remove empty directories that might be left behind (except .daisy)
    find . -type d -empty ! -path "./.daisy" ! -path "./.daisy/*" -delete 2>/dev/null || true
    
    echo "Cleanup complete."
    echo ""
}

# Function to create symlink with proper directory structure
create_symlink() {
    local host_path="$1"
    local container_path="$2"
    local readonly="$3"
    
    # Remove /app/workspace prefix from container path to get relative path
    local relative_path="${container_path#/app/workspace/}"
    
    # Skip if it's the same as container path (no /app/workspace prefix)
    if [[ "$relative_path" == "$container_path" ]]; then
        echo -e "${YELLOW}Skipping: $container_path (not in /app/workspace/)${NC}"
        return
    fi
    
    # Skip if host path doesn't exist
    if [[ ! -e "$host_path" ]]; then
        echo -e "${YELLOW}Warning: Host path does not exist: $host_path${NC}"
        return
    fi
    
    # Create parent directory if it doesn't exist
    local parent_dir="$(dirname "$relative_path")"
    if [[ "$parent_dir" != "." && ! -d "$parent_dir" ]]; then
        echo "Creating directory: $parent_dir"
        mkdir -p "$parent_dir"
    fi
    
    # Note: cleanup already handled by clean_symlinks function
    
    # Create the symlink
    echo -e "Creating symlink: ${GREEN}$relative_path${NC} -> ${BLUE}$host_path${NC}"
    if [[ "$readonly" == "true" ]]; then
        echo -e "  ${YELLOW}(read-only)${NC}"
    fi
    
    ln -sf "$host_path" "$relative_path"
}

# Clean existing symlinks first
clean_symlinks

# Parse the override file and extract volume mounts using pure bash
echo "Parsing docker-compose.override.yml..."
echo ""

# Parse YAML with bash - look for volume lines under cassistant service
in_cassistant_volumes=false

while IFS= read -r line; do
    # Remove leading whitespace and comments
    trimmed_line="$(echo "$line" | sed 's/^[[:space:]]*//' | sed 's/#.*//')"
    
    # Skip empty lines
    [[ -z "$trimmed_line" ]] && continue
    
    # Check if we're entering cassistant service
    if [[ "$trimmed_line" == "cassistant:" ]]; then
        in_cassistant_volumes=false
        continue
    fi
    
    # Check if we're in volumes section under cassistant
    if [[ "$in_cassistant_volumes" == false && "$trimmed_line" == "volumes:" ]]; then
        in_cassistant_volumes=true
        continue
    fi
    
    # Reset if we hit another service or top-level section
    if [[ "$trimmed_line" =~ ^[a-zA-Z] && ! "$trimmed_line" =~ ^- ]]; then
        in_cassistant_volumes=false
        continue
    fi
    
    # Process volume mount lines
    if [[ "$in_cassistant_volumes" == true && "$trimmed_line" =~ ^- ]]; then
        # Remove leading "- " and quotes
        volume_line="${trimmed_line#- }"
        volume_line="${volume_line#\"}"
        volume_line="${volume_line%\"}"
        
        # Skip if line is empty after processing
        [[ -z "$volume_line" ]] && continue
        
        # Parse volume string: host_path:container_path[:options]
        IFS=':' read -ra parts <<< "$volume_line"
        
        if [[ ${#parts[@]} -ge 2 ]]; then
            host_path="${parts[0]}"
            container_path="${parts[1]}"
            options="${parts[2]:-}"
            
            # Check if read-only
            readonly="false"
            if [[ "$options" == *"ro"* ]]; then
                readonly="true"
            fi
            
            # Create the symlink
            create_symlink "$host_path" "$container_path" "$readonly"
        fi
    fi
done < "$OVERRIDE_FILE"

echo ""
echo -e "${GREEN}Mount synchronization complete!${NC}"
echo ""
echo "The workspace now mirrors the Docker container's file structure."
echo "You can access the same files that the containerized assistant sees."