# Claude Voice Assistant

A fast, voice-enabled AI coding assistant powered by Claude Code, featuring wake word detection, real-time speech recognition, and local text-to-speech.

## Features

- **Wake Word Detection**: Custom "hey daisy" wake word using Picovoice Porcupine
- **Real-Time Speech Recognition**: Streaming STT with Picovoice Cheetah
- **Local Text-to-Speech**: Fast, offline TTS using Piper
- **Full Claude Code Integration**: Programmable AI coding assistant
- **Conversation History**: Persistent conversation tracking
- **Sound Effects**: Audio feedback for assistant states
- **Modular Architecture**: Clean, maintainable codebase

## Quick Start

### Installation

```bash
# Install dependencies
pip install -e .

# Or with UV (recommended)
uv sync
```

### Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your API keys to `.env`:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
   PICOVOICE_ACCESS_KEY=your-picovoice-key-here
   ```

3. Install Piper TTS (if not already installed):
   ```bash
   pip install piper-tts
   ```

### Usage

**Basic usage:**
```bash
# Using installed entry point
claude-assistant

# Or with UV
uv run python -m voice_assistant.main
```

**With options:**
```bash
# Specify working directory
claude-assistant --directory ./my-project

# Resume specific conversation
claude-assistant --id abc123

# Process initial prompt
claude-assistant --prompt "list all python files"

# Custom tool allowlist
claude-assistant --allowedTools "Read,Write,Edit,Bash"
```

**Say "hey daisy" to activate**, then speak your request.

## Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) - System design and structure
- [Development Guide](docs/DEVELOPMENT.md) - Contributing and development setup
- [Full Documentation](docs/CLAUDE.md) - Complete project documentation

## Project Structure

```
claude-assistant/
├── src/
│   ├── voice_assistant/     # Voice assistant implementation
│   │   ├── audio/           # STT, TTS, wake word, sounds
│   │   ├── claude/          # Claude Code client, conversation
│   │   ├── ui/              # Console UI
│   │   ├── config.py        # Configuration management
│   │   ├── assistant.py     # Main assistant orchestrator
│   │   └── main.py          # CLI entry point
│   └── mcp/                 # MCP servers
│       ├── base.py          # Base server class
│       └── trading_agent/   # Trading agent MCP server
├── tests/                   # Test suite
├── config/                  # Configuration files
│   └── tool_allowlists/     # Tool permission configs
├── data/                    # Runtime data
│   ├── conversations/       # Conversation logs
│   └── sandbox/             # Claude workspace
├── assets/                  # Static assets
│   └── audio/               # Sound effects
├── docs/                    # Documentation
└── sandbox/                 # Default workspace

```

## Requirements

- Python 3.9+
- Anthropic API key (for Claude)
- Picovoice access key (for wake word & STT)
- Piper TTS installed
- Linux/macOS (Windows may require modifications)

## License

MIT

## Credits

- **Claude Code**: Anthropic's programmable AI coding assistant
- **Picovoice**: Wake word detection (Porcupine) and streaming STT (Cheetah)
- **Piper TTS**: Fast, local text-to-speech
- **Rich**: Beautiful terminal output
