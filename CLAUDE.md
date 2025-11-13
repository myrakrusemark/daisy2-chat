# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Assistant is a web-based voice assistant that integrates Claude Code API with real-time speech recognition and text-to-speech capabilities. The system features a FastAPI backend with WebSocket connections, browser-native speech recognition, and multiple STT/TTS engines for flexibility.

## Development Commands

### Python/Backend Development

```bash
# Install dependencies and run backend server  
uv sync && python -m src.api.server

# Run with development mode
npm run dev

# Format and lint Python code
ruff format src/ tests/
ruff check src/ tests/ --fix

# Type checking
mypy src/
```

### Frontend/JavaScript Development

```bash
# Lint JavaScript code
npm run lint

# Fix JavaScript linting issues  
npm run lint:fix
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:watch          # Jest with watch mode
npm run test:coverage       # Jest with coverage
npm run test:browser        # Playwright browser tests
npm run test:e2e           # End-to-end tests only

# Python tests
pytest tests/              # All Python tests
pytest tests/unit/         # Unit tests only
pytest tests/integration/  # Integration tests only
pytest tests/performance/  # Performance tests only
```

### Health Checks and Monitoring

```bash
# Run health check script
./scripts/check_health.sh

# Run comprehensive health validation
python scripts/health_check.py

# Test runner script
python scripts/run_tests.py
```

## Architecture Overview

### Core Components

**FastAPI Server** (`src/api/server.py`): Main application server with:
- WebSocket endpoints for real-time communication
- Session management with isolation
- File download capabilities with token security
- Health monitoring and metrics

**Session Manager** (`src/api/session_manager.py`): Handles multiple concurrent sessions with:
- Resource monitoring (memory, CPU usage)
- Health status tracking 
- Automatic cleanup and timeout management
- Session isolation for multi-user support

**Claude Client** (`src/voice_assistant/claude/client.py`): Wrapper for Claude Code CLI:
- Voice-optimized responses (no markdown/emojis for TTS)
- Streaming support for real-time feedback
- Tool allowlist management
- Working directory isolation

**WebSocket Handler** (`src/api/websocket_handler.py`): Real-time communication:
- Message routing between UI and Claude sessions
- Streaming response handling
- Connection management and error handling

### Frontend Architecture

**Web UI** (`web/static/js/`): Browser-based interface with:
- `app.js`: Main application controller with Android app detection
- `audio.js`: Audio recording and playback management
- `wake-word.js`: Wake word detection using Porcupine
- `websocket.js`: WebSocket communication layer
- `ui-components.js`: Dynamic UI updates and state management
- `state-themes.js`: UI theming and visual states

### Speech Recognition Engines

The system supports multiple STT engines:
- **Browser Speech Recognition**: Native Web Speech API
- **Faster Whisper**: Local processing with CUDA/CPU support
- **Android App**: External STT via Android companion app

STT Engine priority (configurable):
1. Android App (when available)
2. Faster Whisper (local)
3. Browser Speech Recognition (fallback)

### MCP Server Integration

**Base MCP Architecture** (`src/mcp/base.py`):
- Abstract base class for all MCP implementations
- Standardized tool registration and handler setup
- Common error handling and logging

**Available MCP Servers**:
- Google Workspace MCP (`src/mcp/google_workspace_mcp/`)
- ProtonMail MCP (`src/mcp/protonmail-mcp/`)
- Trading Agent MCP (`src/mcp/trading_agent/`)
- File Downloads MCP (`src/mcp/file_downloads/`)
- Weather MCP (`src/mcp/weather_mcp/`)
- Drive Schedule MCP (`src/mcp/drive_schedule_mcp/`)

## Configuration

### Environment Variables

Required in `.env` file:
```bash
ANTHROPIC_API_KEY=sk-ant-...     # Claude API access
LOG_LEVEL=INFO                   # Logging level
MAX_SESSIONS=10                  # Concurrent session limit  
SESSION_TIMEOUT=3600             # Session timeout in seconds
```

Optional for enhanced features:
```bash
PICOVOICE_ACCESS_KEY=...         # Wake word detection
OPENAI_API_KEY=sk-...           # Alternative TTS (if used)
```

### Tool Allowlists

Security profiles in `config/tool_allowlists/`:
- `safe.yml`: Read-only operations + basic editing
- `coding.yml`: Full development tools (file ops, bash, web)
- `full.yml`: All available tools including custom MCP tools

### Audio Configuration

**Piper TTS Models** (`models/piper/`):
- `en_US-lessac-low.onnx`: US English voice
- `en_GB-southern_english_female-low.onnx`: British English voice

**Wake Word Models** (`web/static/models/`):
- `hey-daisy_en_wasm_v3_0_0.ppn`: "Hey Daisy" wake word detection

## Key Patterns and Conventions

### Voice-Optimized Responses

When Claude generates responses for voice output, it follows specific formatting rules:
- No markdown formatting (* ** # ` [] ())
- No emojis or symbols
- Conversational language suitable for TTS
- Download links handled automatically by UI (don't read URLs)

### Session Management Pattern

Each user session is isolated with:
- Unique session ID
- Dedicated working directory
- Resource monitoring and cleanup
- Conversation history persistence

### Android App Integration

The system detects Android companion apps and automatically:
- Prioritizes Android STT over browser recognition
- Handles deep link communication
- Falls back gracefully when app unavailable

### WebSocket Communication Protocol

Message types:
- `user_message`: User input from any source (voice, text)
- `assistant_chunk`: Streaming Claude response parts
- `tool_call`: Tool execution notifications
- `session_info`: Session metadata and status
- `error`: Error notifications

### Security Considerations

- All file operations restricted to workspace directory
- Download tokens expire after single use
- Tool allowlists prevent unauthorized operations
- Session isolation prevents cross-user data access

## Testing Strategy

**Unit Tests** (`tests/unit/`): Fast isolated component tests
- Session manager functionality
- Whisper service integration

**Integration Tests** (`tests/integration/`): Multi-component workflows  
- Parallel STT functionality
- MCP server integration
- Persistent Claude sessions

**Frontend Tests** (`tests/frontend/`): Browser-based testing with Jest
- Audio recording functionality
- Wake word detection
- WebSocket communication

**E2E Tests** (`tests/e2e/`): Full workflow testing with Playwright
- Complete voice interaction workflows
- Cross-browser compatibility

**Performance Tests** (`tests/performance/`): Load and resource testing
- Concurrent session handling
- Memory usage monitoring
- STT engine performance comparison

## Development Workflow

### Adding New MCP Servers

1. Create new directory in `src/mcp/your_server/`
2. Implement `BaseMCPServer` subclass with required methods
3. Add server configuration to main MCP router
4. Update tool allowlists if needed
5. Add integration tests

### Frontend Feature Development

1. Update constants in `web/static/js/constants.js`
2. Implement feature in appropriate component file
3. Add event listeners in `app.js`
4. Update UI components in `ui-components.js`
5. Test with browser and mobile compatibility

### Adding New STT Engines

1. Extend STT engine detection in `app.js`
2. Add engine configuration to constants
3. Implement fallback logic in audio management
4. Add performance tests for new engine

## Branch and Deployment Information

- **Current Branch**: `feature/android-app-detection`
- **Main Branch**: Main production branch
- **Recent Features**: 
  - Android app STT integration
  - Multi-layered wake word detection 
  - Comprehensive health monitoring

## Performance Notes

- Wake word detection runs in browser for minimal latency
- Local TTS (Piper) avoids API call overhead
- Faster Whisper provides superior accuracy for voice commands
- Session pooling reduces Claude Code startup overhead
- WebSocket streaming provides real-time response feedback