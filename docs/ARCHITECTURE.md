# Architecture Guide

## System Overview

The Claude Assistant is a web-based application with a FastAPI backend that manages Claude Code sessions via WebSocket connections.

```
┌─────────────────────────────────────────┐
│          Web UI (Browser)               │
│  (HTML/CSS/JavaScript Interface)        │
└────────────────┬────────────────────────┘
                 │ WebSocket
┌────────────────▼────────────────────────┐
│       FastAPI Server                    │
│  (Session & WebSocket Management)       │
└───┬──────────┬──────────┬───────────────┘
    │          │          │
    ▼          ▼          ▼
┌───────┐  ┌───────┐  ┌───────┐
│Session│  │Claude │  │Download│
│Manager│  │Client │  │Manager │
└───────┘  └───────┘  └───────┘
```

## Layer Descriptions

### 1. Web UI Layer (`web/`)

Browser-based interface for interacting with Claude:

- Real-time chat interface via WebSocket
- Tool execution monitoring
- File download capabilities
- Session management

### 2. API Layer (`src/api/`)

FastAPI server managing sessions and connections:

- **Server** (`server.py`): Main FastAPI application with routes
- **Session Manager** (`session_manager.py`): Multi-session handling
- **WebSocket Handler** (`websocket_handler.py`): Real-time message routing
- **Download Manager** (`download_manager.py`): Secure file download tokens

**Key Design Decisions:**
- WebSocket for real-time streaming
- Session-based isolation for multi-user support
- Token-based download security

### 3. Claude Client Layer (`src/voice_assistant/claude/`)

Manages Claude Code integration:

- **Claude Client** (`client.py`): Claude Code CLI subprocess wrapper with streaming
- **Conversation Manager** (`conversation.py`): History persistence

**Key Design Decisions:**
- Persistent subprocess for reduced latency
- Streaming responses for real-time feedback
- Conversation history for context continuity

## Data Flow

```
1. User opens web page
   ↓
2. WebSocket connection established
   ↓
3. Session created with Claude client
   ↓
4. User sends message via WebSocket
   ↓
5. Claude client processes with streaming
   ↓
6. Tool executions streamed back to UI
   ↓
7. Final response displayed
   ↓
8. Conversation history maintained
```

## MCP Server Architecture

MCP (Model Context Protocol) servers follow a plugin architecture:

```
BaseMCPServer (abstract)
    ├── _register_handlers() - Setup tools/resources
    └── get_tools() - Tool definitions

TradingAgentMCP (concrete)
    ├── Trading-specific tools
    └── Order management logic
```

## Configuration System

Three-tiered configuration approach:

1. **Defaults** - Hardcoded in `config.py`
2. **Environment** - From `.env` file
3. **Runtime** - CLI arguments override all

Priority: CLI args > Environment > Defaults

## Security Considerations

### Tool Allowlists

Three pre-configured security profiles:

- **Safe** (`config/tool_allowlists/safe.yml`): Read-only + basic editing
- **Coding** (`coding.yml`): Full file ops + Bash + Web
- **Full** (`full.yml`): Everything including custom tools

### Workspace Isolation

- Default working directory: `./workspace`
- No symlinks to sensitive directories
- Gitignored to prevent accidental commits

## Testing Strategy

```
tests/
├── unit/              # Component isolation tests
├── integration/       # Multi-component workflows
└── fixtures/          # Test data (audio, conversations)
```

## Performance Optimizations

1. **Non-blocking Audio**: Sound effects don't block main loop
2. **Streaming STT**: Real-time transcription vs batch
3. **Local TTS**: No API latency
4. **YAML Storage**: Fast I/O for conversation logs

## Extension Points

### Adding Custom MCP Servers

1. Create subclass of `BaseMCPServer`
2. Implement `_register_handlers()` and `get_tools()`
3. Add to `src/mcp/your_server/`

### Adding New API Endpoints

Extend `src/api/server.py` with new FastAPI routes:
```python
@app.post("/your-endpoint")
async def your_endpoint():
    ...
```
