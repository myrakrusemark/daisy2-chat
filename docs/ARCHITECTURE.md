# Architecture Guide

## System Overview

The Claude Voice Assistant is built on a modular architecture separating concerns into distinct layers:

```
┌─────────────────────────────────────────┐
│          User Interface Layer           │
│  (Rich Console UI, Sound Effects)       │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│       Application Layer                 │
│  (VoiceAssistant orchestrator)          │
└───┬──────────┬──────────┬───────────────┘
    │          │          │
    ▼          ▼          ▼
┌───────┐  ┌───────┐  ┌───────┐
│ Audio │  │Claude │  │Config │
│ Layer │  │ Layer │  │Manager│
└───────┘  └───────┘  └───────┘
```

## Layer Descriptions

### 1. Audio Layer (`src/voice_assistant/audio/`)

Handles all audio input/output operations:

- **Wake Word Detection** (`wake_word.py`): Picovoice Porcupine integration
- **Speech-to-Text** (`stt.py`): Picovoice Cheetah streaming STT
- **Text-to-Speech** (`tts.py`): Piper TTS for local voice synthesis
- **Sound Effects** (`sounds.py`): Audio feedback management

**Key Design Decisions:**
- Each audio component is self-contained and independently testable
- Streaming STT (Cheetah) chosen over batch processing for lower latency
- Local TTS (Piper) eliminates API dependencies and reduces costs

### 2. Claude Layer (`src/voice_assistant/claude/`)

Manages Claude Code integration and conversation:

- **Claude Client** (`client.py`): Subprocess wrapper for Claude CLI
- **Conversation Manager** (`conversation.py`): History persistence (YAML)

**Key Design Decisions:**
- Uses subprocess instead of direct API for tool access consistency
- YAML format for human-readable conversation logs
- Conversation history limited to recent messages to manage context size

### 3. Configuration Layer (`src/voice_assistant/config.py`)

Centralized configuration management using dataclasses:

- `AssistantConfig`: Main configuration container
- `AudioConfig`: Audio-specific settings
- `ClaudeConfig`: Claude Code settings
- `PicovoiceConfig`: Wake word & STT settings

**Key Design Decisions:**
- Dataclasses for type safety and IDE autocomplete
- Environment variable defaults with programmatic overrides
- Validation logic separated from configuration data

### 4. UI Layer (`src/voice_assistant/ui/`)

Rich-based console interface:

- Status messages and indicators
- Formatted conversation display
- Error and success notifications

### 5. Application Layer (`src/voice_assistant/assistant.py`)

Main orchestrator that coordinates all components:

```python
VoiceAssistant
├── Wake word detected → Play sound
├── Listen for speech → Transcribe
├── Send to Claude → Get response
├── Update conversation → Save history
└── Speak response → Wait for next wake word
```

## Data Flow

```
1. User says "hey daisy"
   ↓
2. WakeWordDetector detects wake word
   ↓
3. SoundEffects plays confirmation
   ↓
4. CheetahSTT listens and transcribes
   ↓
5. ConversationManager adds user message
   ↓
6. ClaudeCodeClient executes request
   ↓
7. ConversationManager adds assistant response
   ↓
8. PiperTTS speaks response
   ↓
9. Loop back to step 1
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

### Sandbox Isolation

- Default working directory: `./sandbox`
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

### Adding New Audio Engines

Implement interface in `src/voice_assistant/audio/`:
```python
class NewSTT:
    def listen(self) -> str: ...
```

### Adding Custom MCP Servers

1. Create subclass of `BaseMCPServer`
2. Implement `_register_handlers()` and `get_tools()`
3. Add to `src/mcp/your_server/`

### Adding New UI Outputs

Extend `AssistantUI` class or create alternative implementation
