# Migration Guide

## Overview

This document has been preserved for historical reference. The project has evolved from a voice assistant to a web-based Claude Code interface.

## Current Architecture (2025)

```
cassistant/
├── src/
│   ├── api/              # FastAPI web server
│   └── mcp/              # MCP server implementations
├── web/                  # Browser-based UI
├── docs/                 # Documentation
└── tests/                # Test suite
```

## Entry Point

**Current:**
```bash
# Start web server
./start-server.sh

# Or directly
uv run cassistant-server
```

Access via browser at `http://localhost:8000`

## Installation

### Fresh Install

```bash
# Clone repository
cd claude-assistant

# Install with pip
pip install -e .

# Or with UV (recommended)
uv sync
```

### Configuration

1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Add your API keys to `.env`

3. Install Piper TTS if not already installed

## Usage Examples

### Basic Usage

```bash
# Default sandbox workspace
claude-assistant

# Custom working directory
claude-assistant --directory ./my-project

# Resume conversation
claude-assistant --id abc123
```

### Using Tool Allowlists

```bash
# Safe mode (read-only + basic editing)
claude-assistant --allowedTools "Read,Edit,Write,Glob,Grep"

# Coding mode (includes Bash)
./start-simple.sh

# Full mode (all tools)
./start.sh
```

## Backward Compatibility

### Old Script Still Works

The old `voice_to_claude_code_fast.py` file is still present for backward compatibility. However:

- ⚠️ **Deprecated**: Will be removed in future versions
- ⚠️ **Not maintained**: Bug fixes only apply to new structure
- ✅ **Transition period**: Use during migration, then switch to new entry point

### Migration Timeline

- **Now**: Both old and new entry points work
- **Next release**: Old file marked as deprecated with warnings
- **Future release**: Old file removed

## Testing Your Migration

```bash
# Test imports
python3 -c "from voice_assistant.config import create_default_config; print('OK')"

# Test entry point
claude-assistant --help

# Test with initial prompt
claude-assistant --prompt "echo 'test'" --directory ./sandbox
```

## Getting Help

- See `README.md` for quick start guide
- See `docs/ARCHITECTURE.md` for system design
- See `docs/CLAUDE.md` for complete documentation
- Check issues on GitHub for known problems

## Reverting (If Needed)

If you need to temporarily revert:

```bash
# Use old script directly
uv run voice_to_claude_code_fast.py --directory ./sandbox
```

However, we recommend migrating as soon as possible to benefit from:
- Better code organization
- Easier testing and debugging
- More maintainable codebase
- Future enhancements only in new structure
