#!/bin/bash

# Start the Claude Code MCP Server with configuration
# This script allows you to pass tool restrictions and working directory settings

# Default values
WORKING_DIR="${WORKING_DIR:-./workspace}"
ALLOWED_TOOLS="${ALLOWED_TOOLS:-Hass* GetLiveContext todo_get_items read_file read_text_file Read Edit Write Bash Glob Grep WebFetch WebSearch}"
PERMISSION_MODE="${PERMISSION_MODE:-bypassPermissions}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --working-dir|-d)
            WORKING_DIR="$2"
            shift 2
            ;;
        --allowed-tools|-t)
            ALLOWED_TOOLS="$2"
            shift 2
            ;;
        --permission-mode|-p)
            PERMISSION_MODE="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Start the Claude Code MCP Server with configuration"
            echo ""
            echo "Options:"
            echo "  -d, --working-dir DIR      Working directory for Claude operations (default: ./workspace)"
            echo "  -t, --allowed-tools TOOLS  Space-separated list of allowed tool patterns (default: Hass* GetLiveContext...)"
            echo "  -p, --permission-mode MODE Permission mode: bypassPermissions, acceptEdits, plan (default: bypassPermissions)"
            echo "  -h, --help                 Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  WORKING_DIR       Same as --working-dir"
            echo "  ALLOWED_TOOLS     Same as --allowed-tools"
            echo "  PERMISSION_MODE   Same as --permission-mode"
            echo ""
            echo "Examples:"
            echo "  # Start with default settings (Home Assistant tools enabled)"
            echo "  $0"
            echo ""
            echo "  # Start with custom working directory"
            echo "  $0 --working-dir /path/to/project"
            echo ""
            echo "  # Start with specific tools only"
            echo "  $0 --allowed-tools 'Read Write Bash'"
            echo ""
            echo "  # Use environment variables"
            echo "  ALLOWED_TOOLS='Hass* Read Write' $0"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Export configuration for the server to read
export MCP_WORKING_DIR="$WORKING_DIR"
export MCP_ALLOWED_TOOLS="$ALLOWED_TOOLS"
export MCP_PERMISSION_MODE="$PERMISSION_MODE"

echo "Starting Claude Code MCP Server..."
echo "  Working Directory: $WORKING_DIR"
echo "  Allowed Tools: $ALLOWED_TOOLS"
echo "  Permission Mode: $PERMISSION_MODE"
echo ""

# Start the server
exec uv run claude_code_mcp_server.py
