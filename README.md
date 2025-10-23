# Claude Assistant - Web Interface

A web-based voice AI assistant powered by Claude Code with browser-native speech recognition and text-to-speech.

## Features

- **🎤 Browser-Based Voice Input** - Web Speech API (Firefox/Chrome native)
- **🔊 Browser-Based Voice Output** - Speech Synthesis API (no external TTS needed)
- **🌐 Web Interface** - Modern, responsive UI accessible from any device
- **🔌 WebSocket Real-Time Communication** - Instant responses and tool notifications
- **⚡ Multiple Activation Modes** - Push-to-talk, click-to-activate, or wake word (optional)
- **🛠️ Full Claude Code Integration** - Programmable AI coding assistant
- **💬 Conversation History** - Persistent conversation tracking
- **🔧 Tool Usage Display** - Real-time notifications when Claude uses tools
- **🎨 Modern UI** - Dark theme, smooth animations, mobile-responsive
- **🐳 Docker Ready** - Easy deployment with Docker Compose

## Quick Start

### Prerequisites

- Docker and Docker Compose (recommended)
- OR Python 3.10+ with uv package manager
- Anthropic API key
- Modern web browser (Firefox or Chrome recommended)

### Option 1: Docker (Recommended)

1. **Clone and setup:**
   ```bash
   git clone <repo-url>
   cd cassistant
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

2. **Start the server:**
   ```bash
   docker-compose up -d
   ```

3. **Open browser:**
   ```
   http://localhost:8000
   ```

### Option 2: Local Development

1. **Install dependencies:**
   ```bash
   uv sync
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your ANTHROPIC_API_KEY
   ```

3. **Run the server:**
   ```bash
   uv run python -m api.server
   # OR
   uv run cassistant
   ```

4. **Open browser:**
   ```
   http://localhost:8000
   ```

## Usage

### Activation Modes

**Push-to-Talk:**
- Hold button to speak
- Release to send message
- Best for quick interactions

**Click-to-Activate:**
- Click once to start listening
- Automatic silence detection stops recording
- Best for hands-free after activation

**Wake Word (Coming Soon):**
- Say "Hey Daisy" to activate
- Requires Pico-voice Web SDK
- Best for fully hands-free operation

### Settings Panel

Click the **⚙️ Settings** button to configure:

- **Working Directory** - Where Claude operates (validated for security)
- **Tool Profile** - Safe, Coding, or Full tool access
- **Permission Mode** - Auto-approve or require approval
- **TTS Voice** - Select from available browser voices
- **Speech Rate** - Adjust playback speed
- **Sound Effects** - Enable/disable audio feedback

### Keyboard Shortcuts

- Press and hold **Space** - Same as push-to-talk (coming soon)
- **Esc** - Stop listening/speaking

## Architecture

### Backend (FastAPI)

```
src/api/
├── server.py              # FastAPI app and routes
├── session_manager.py     # Multi-session state management
├── websocket_handler.py   # WebSocket message routing
└── models.py              # Pydantic data models
```

### Frontend (Vanilla JavaScript)

```
web/
├── index.html
└── static/
    ├── css/styles.css           # Modern UI styling
    ├── js/
    │   ├── app.js               # Main application logic
    │   ├── audio.js             # Web Speech & Synthesis APIs
    │   ├── websocket.js         # WebSocket client
    │   └── ui-components.js     # UI rendering
    └── sounds/                  # Audio feedback files
```

### Key Technologies

**Browser APIs:**
- **Web Speech API** - Speech-to-text (Firefox/Chrome native)
- **Speech Synthesis API** - Text-to-speech (no external service)
- **WebSocket API** - Real-time bidirectional communication
- **Web Audio API** - Sound effects playback

**Backend:**
- **FastAPI** - Modern async Python web framework
- **Uvicorn** - ASGI server
- **Anthropic SDK** - Claude API integration
- **Pydantic** - Data validation and models

**No Audio Dependencies:**
- ❌ No Picovoice Cheetah (browser STT instead)
- ❌ No Piper TTS (browser Speech Synthesis instead)
- ❌ No sounddevice/soundfile (browser handles audio)
- ✅ Lightweight Docker container!

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional - Picovoice for browser wake word
PICOVOICE_ACCESS_KEY=...

# Server
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=INFO

# Sessions
MAX_SESSIONS=10
SESSION_TIMEOUT=3600

# Security
DEFAULT_WORKSPACE=/app/sandbox
ALLOWED_WORKSPACE_PATHS=/app/sandbox,/app/data/custom
```

### Tool Allowlists

Located in `config/tool_allowlists/`:

- **safe.yml** - Read-only operations
- **coding.yml** - Balanced permissions (default)
- **full.yml** - All tools enabled

## API Endpoints

### REST API

- `GET /` - Serve web interface
- `GET /health` - Health check
- `POST /api/sessions` - Create new session
- `GET /api/sessions` - List active sessions
- `GET /api/sessions/{id}` - Get session info
- `DELETE /api/sessions/{id}` - Delete session
- `GET /api/conversations/{id}` - Get conversation history
- `POST /api/sessions/{id}/config` - Update session config

### WebSocket

- `WS /ws/{session_id}` - Real-time communication

**Message Types:**

Client → Server:
```json
{"type": "user_message", "content": "text from STT"}
{"type": "interrupt", "reason": "user_stopped"}
{"type": "config_update", "config": {...}}
```

Server → Client:
```json
{"type": "assistant_message", "content": "response", "tool_calls": [...]}
{"type": "tool_use", "tool": "Bash", "input": {...}, "summary": "..."}
{"type": "processing", "status": "thinking|complete"}
{"type": "error", "message": "..."}
```

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t claude-assistant .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Volume Mounts

- `./data/conversations` - Persistent conversation history
- `./sandbox` - Default working directory
- `./data/custom` - Custom workspace (optional)

## Browser Compatibility

**Fully Supported:**
- ✅ Firefox (recommended) - Full Web Speech API support
- ✅ Chrome/Edge - Full support with webkit prefixes

**Limited Support:**
- ⚠️ Safari - Limited Web Speech API, may not work fully

**Not Supported:**
- ❌ Internet Explorer

## Development

### Project Structure

```
cassistant/
├── src/
│   ├── api/                    # FastAPI backend
│   ├── core/                   # Core logic (no audio)
│   └── voice_assistant/        # Reusable Claude components
│       ├── claude/             # Claude integration
│       └── config.py
├── web/                        # Frontend
├── config/                     # Tool allowlists
├── data/                       # Conversations & workspaces
├── Dockerfile                  # Container definition
└── docker-compose.yml          # Orchestration
```

### Running Tests

```bash
pytest tests/
```

### Adding New Tools

1. Add tool to `config/tool_allowlists/`
2. Configure in session creation or settings panel
3. Tool becomes available to Claude

## Migration from Desktop Version

This version replaces the desktop voice assistant with a web-based interface:

**Removed:**
- Desktop-only audio components (Picovoice Cheetah STT, Piper TTS)
- Terminal UI (Rich console)
- CLI entry points

**Added:**
- Web interface with modern UI
- Browser-based audio (Web Speech API)
- WebSocket real-time communication
- Multi-session support
- Docker deployment

## Troubleshooting

### Browser Issues

**Speech Recognition not working:**
- Ensure microphone permissions granted
- Check browser compatibility (use Firefox/Chrome)
- Test at `chrome://settings/content/microphone`

**TTS not speaking:**
- Check browser voice availability
- Try different voices in settings
- Ensure volume not muted

### Server Issues

**Connection refused:**
```bash
# Check if server is running
docker-compose ps

# Check logs
docker-compose logs -f
```

**Session limit reached:**
- Increase `MAX_SESSIONS` in `.env`
- Or wait for inactive sessions to timeout

### Permission Errors

**Working directory not allowed:**
- Add path to `ALLOWED_WORKSPACE_PATHS` in `.env`
- Restart container to apply changes

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly (especially browser compatibility)
5. Submit pull request

## License

MIT

## Credits

- **Anthropic Claude** - AI assistant
- **FastAPI** - Web framework
- **Web Speech API** - Browser-native STT/TTS
- **Pico-voice** - Optional wake word detection

---

**Need Help?** Open an issue on GitHub or check the documentation in `/docs`
