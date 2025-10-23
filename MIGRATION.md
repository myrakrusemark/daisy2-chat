# Migration Guide

## Overview

The project has been reorganized from a monolithic structure to a clean, modular architecture. This guide helps you migrate from the old structure to the new one.

## What Changed

### Old Structure
```
claude-assistant/
├── voice_to_claude_code_fast.py  # 1,290 line monolith
├── sounds/                        # Sound effects
├── output/                        # Conversation logs
├── mcp-servers/                   # MCP implementations
└── sandbox/                       # Workspace
```

### New Structure
```
claude-assistant/
├── src/                          # Organized source code
│   ├── voice_assistant/          # Modular voice assistant
│   └── mcp/                      # MCP servers with base class
├── assets/audio/                 # Sound effects (moved)
├── data/conversations/           # Conversation logs (moved)
├── config/                       # Configuration files
├── docs/                         # Documentation
└── tests/                        # Test suite
```

## File Mapping

| Old Location | New Location | Notes |
|-------------|--------------|-------|
| `voice_to_claude_code_fast.py` | `src/voice_assistant/` | Split into modules |
| `sounds/` | `assets/audio/` | Renamed for clarity |
| `output/` | `data/conversations/` | Better organization |
| `mcp-servers/` | `src/mcp/trading_agent/` | Structured as package |
| `CLAUDE.md` | `docs/CLAUDE.md` | Documentation folder |

## Breaking Changes

### 1. Entry Point Changed

**Old:**
```bash
uv run voice_to_claude_code_fast.py
```

**New:**
```bash
# Using module
uv run python -m voice_assistant.main

# Or using entry point (after install)
claude-assistant

# Or using start script
./start.sh
```

### 2. Import Paths

**Old (if importing):**
```python
from voice_to_claude_code_fast import ClaudeCodeAssistant
```

**New:**
```python
from voice_assistant.assistant import VoiceAssistant
from voice_assistant.config import create_default_config

config = create_default_config()
assistant = VoiceAssistant(config)
```

### 3. Sound File Paths

Sound files moved from `sounds/` to `assets/audio/`. The config system handles this automatically, but if you have custom scripts, update paths.

### 4. Conversation Logs

Conversation history files moved from `output/` to `data/conversations/`. Old files have been migrated automatically.

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
