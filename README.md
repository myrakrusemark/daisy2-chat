# Claude Assistant

A sophisticated voice-powered assistant that integrates Claude Code API with real-time speech recognition and text-to-speech capabilities. Features a FastAPI backend with WebSocket connections, browser-native speech recognition, and multiple STT/TTS engines for flexibility.

## Features

- 🗣️ **Voice Interaction**: Real-time speech-to-text with browser Web Speech API, Faster Whisper, and Android app integration
- 🤖 **Claude Code Integration**: Full access to Claude's coding capabilities with streaming responses
- 🔧 **Extensible MCP Servers**: Custom Model Context Protocol servers for enhanced functionality
- 🌐 **Web Interface**: Modern responsive UI with DaisyUI components
- 📱 **Cross-Platform**: Works in browsers, supports Android companion app
- 🔊 **Advanced Audio**: Wake word detection, voice activity detection, and high-quality TTS
- 📁 **Workspace Management**: Isolated sessions with custom notifications and configurations

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 16+ (for frontend build tools)
- UV package manager (`pip install uv`)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd daisy2
   ```

2. **Install dependencies**
   ```bash
   uv sync
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys (see Configuration section below)
   ```

4. **Start the server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   ```
   http://localhost:8000
   ```

## Configuration

### Required Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required: Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-your-api-key-here

# Optional: Wake word detection
PICOVOICE_ACCESS_KEY=your-picovoice-access-key-here
```

### Tool Allowlists

The system uses tool allowlists for security. Configure in `config/tool_allowlists/`:

- **safe.yml**: Read-only operations + basic editing
- **coding.yml**: Full development tools (file ops, bash, web)
- **full.yml**: All available tools including custom MCP tools

### MCP Server Setup

Custom MCP servers extend Claude's capabilities. The system includes:

#### Built-in MCP Servers

- **File Downloads**: Secure file download management
- **Weather**: Weather information and forecasts

#### Adding Custom MCP Servers

1. **Create your MCP server** in `src/mcp/your_server/`
   ```python
   from ..base import BaseMCPServer
   
   class YourMCPServer(BaseMCPServer):
       def __init__(self):
           super().__init__("your-server")
           
       async def setup_tools(self):
           # Register your tools here
           pass
   ```

2. **Configure workspace integration**
   Create `workspace/mcp-config.json` based on the example:
   ```json
   {
     "mcpServers": {
       "your-server": {
         "command": "python3",
         "args": ["./src/mcp/your_server/server.py"],
         "env": {
           "YOUR_API_KEY": "${YOUR_API_KEY}"
         }
       }
     }
   }
   ```

### Workspace Notifications with .daisy

The `.daisy` directory in your workspace enables custom notifications and configurations:

#### Notification System

Create `workspace/.daisy/notifications.yml` for dynamic workspace notifications:

```yaml
notifications:
  - id: "welcome"
    title: "Welcome Back"
    content_type: "static"
    content:
      text: "Ready to code! Time: ${time}"
    style: "info"
    
  - id: "git-status"
    title: "Repository Status"
    content_type: "script" 
    content:
      script: "git status --porcelain | wc -l"
    style: "warning"
```

**Notification Types:**
- `static`: Simple text with variable substitution
- `script`: Execute shell commands
- `mcp`: Call MCP server methods
- `agent_processed`: Process content through Claude for formatting

**Variables Available:**
- `${sessionId}`, `${workingDir}`, `${timestamp}`, `${date}`, `${time}`

#### Docker Integration

Create `workspace/.daisy/docker-compose.override.yml` for custom mounts:

```yaml
version: '3.8'
services:
  daisy2:
    volumes:
      - /path/to/your/documents:/workspace/data/documents:ro
      - /path/to/your/projects:/workspace/projects:rw
```

## Development

### Commands

```bash
# Backend development
uv sync && python -m src.api.server
npm run dev

# Code formatting
ruff format src/ tests/
ruff check src/ tests/ --fix

# Type checking  
mypy src/

# Frontend linting
npm run lint
npm run lint:fix

# Testing
npm test                    # All tests
npm run test:browser        # Playwright browser tests
npm run test:e2e           # End-to-end tests
pytest tests/              # Python tests
```

### Architecture

**Core Components:**
- **FastAPI Server**: WebSocket-based real-time communication
- **Session Manager**: Multi-user session isolation and resource monitoring  
- **Claude Client**: Voice-optimized Claude Code integration
- **Audio Pipeline**: Multi-engine STT/TTS with wake word detection

**Frontend:**
- **Modern UI**: Tailwind CSS + DaisyUI components
- **Real-time Updates**: WebSocket communication with streaming responses
- **Audio Management**: Browser audio recording with voice activity detection
- **Mobile Support**: Android app integration with deep links

### Speech Recognition Engines

Priority order (configurable):
1. **Android App**: External STT via companion app
2. **Faster Whisper**: Local processing with CUDA/CPU support  
3. **Browser Speech Recognition**: Web Speech API fallback

### Security

- All file operations restricted to workspace directory
- Download tokens expire after single use
- Tool allowlists prevent unauthorized operations
- Session isolation prevents cross-user data access

## Deployment

### Docker

```bash
docker-compose up -d
```

### Manual Deployment

1. **Configure production environment**
   ```bash
   cp .env.example .env
   # Set production values
   export ANTHROPIC_API_KEY=your-key
   ```

2. **Build frontend**
   ```bash
   npm run build
   ```

3. **Start server**
   ```bash
   python -m src.api.server
   ```

## Troubleshooting

### Common Issues

**Wake word detection not working:**
- Check `PICOVOICE_ACCESS_KEY` in `.env`
- Ensure microphone permissions in browser

**Claude responses failing:**
- Verify `ANTHROPIC_API_KEY` in `.env`  
- Check API key permissions and limits

**File operations blocked:**
- Review tool allowlist configuration
- Check workspace directory permissions

### Health Monitoring

```bash
# Run health checks
./scripts/check_health.sh
python scripts/health_check.py
```

## Contributing

1. **Development Setup**
   ```bash
   git clone <repository-url>
   cd daisy2
   uv sync
   npm install
   ```

2. **Run Tests**
   ```bash
   npm test
   pytest tests/
   ```

3. **Code Quality**
   ```bash
   ruff format src/
   npm run lint:fix
   ```

## License

MIT License - see LICENSE.txt for details.
