# Claude Instructions for Claude Code Is Programmable

## Project Overview

This repository demonstrates how to use **Claude Code programmatically** - treating Claude as an automatable AI coding assistant that can be orchestrated through scripts and CLI commands. The project showcases progressive examples from simple shell scripts to advanced voice-driven development workflows.

**Core Principle**: Claude Code is not just interactive - it can be invoked programmatically with specific instructions, file permissions, and tool restrictions for repeatable, automated workflows.

## Repository Structure

### Root Level - Core Examples (Progressive Complexity)

1. **`claude_code_is_programmable_1.sh`** - Simplest example (shell script calling Claude CLI)
2. **`claude_code_is_programmable_2.py`** - Basic Python automation (creates TypeScript todo app)
3. **`claude_code_is_programmable_3.py`** - Notion API integration via MCP
4. **`claude_code_is_programmable_4.py`** - Output format examples (text/JSON/stream-JSON)
5. **`claude_code_is_programmable_5.py`** - Multi-step workflow (batch operations)

### MCP Server - Persistent Claude Code (NEW!)

- **`claude_code_mcp_server.py`** - Long-running MCP server with persistent conversation state
- **`claude_code_mcp_client.py`** - Example client demonstrating server usage

**Key Benefit**: No more CLI restart overhead! The MCP server maintains conversation history in memory, dramatically speeding up multi-turn interactions.

### Voice Assistant Scripts

- **`voice_to_claude_code.py`** - Original voice assistant (RealtimeSTT + OpenAI TTS)
- **`anthropic_search.py`** - Web search CLI with citations

### claude-assistant/ - Fast Voice Assistant

**Primary Location**: `/home/myra/claude-assistant/claude-code-is-programmable/claude-assistant/`

- **`voice_to_claude_code_fast.py`** - Enhanced voice assistant with local processing
- **`start.sh`** - Startup script for fast voice assistant
- **`sounds/`** - Audio feedback files (wake.mp3, tool.mp3, etc.)
- **`output/`** - Conversation logs (YAML format)
- **`workspace/`** - Isolated workspace for Claude Code execution

### Documentation (ai_docs/)

- **`claude_code_tech.md`** - Advanced techniques and patterns
- **`claude_code_best_practices.md`** - Best practices guide
- **`claude-code-tutorials.md`** - Step-by-step tutorials
- **`anthropic_web_search_tool.md`** - Web search capability docs
- **`fc_openai_agents.md`** - OpenAI Agents SDK integration
- **`uv-single-file-scripts.md`** - UV package manager guide

## Environment Setup

### Required Environment Variables

Create `.env` file with:

```bash
ANTHROPIC_API_KEY=sk-ant-...           # Required for all Claude Code features
OPENAI_API_KEY=sk-...                  # Optional: only for original voice assistant
NOTION_API_KEY=secret_...              # Optional: for Notion integration examples
```

### Voice Assistant Setup

The fast voice assistant (`claude-assistant/voice_to_claude_code_fast.py`) requires:

1. **Anthropic API Key** - For Claude Code access
2. **Wake Word Detection** - Uses browser Web Speech API for "hey daisy" detection
3. **System Dependencies**:
   - `faster-whisper` - Efficient speech-to-text
   - `piper-tts` - Local text-to-speech (no API needed)
   - `webrtcvad` - Voice activity detection

Set in `.env`:
```bash
PICOVOICE_ACCESS_KEY=your_access_key_here
```

## Key Technologies

- **Claude Code CLI** - Programmable AI coding interface
- **UV** - Python package manager for single-file scripts
- **Web Speech API** - Wake word detection ("hey daisy")
- **faster-whisper** - Fast speech-to-text (local)
- **Piper TTS** - Local text-to-speech (no API)
- **RealtimeSTT** - Real-time speech recognition
- **Anthropic SDK** - Claude API access
- **Rich** - Terminal formatting
- **MCP (Model Context Protocol)** - For API integrations (Notion)

## Important Patterns & Conventions

### 1. UV Script Format

Most Python files use UV's inline dependency declaration:

```python
# /// script
# dependencies = [
#   "anthropic",
#   "rich",
# ]
# ///
```

Run with: `uv run script_name.py`

### 2. Tool Permission Management

**Critical Pattern**: Always restrict tools to minimum required permissions:

```python
--allowedTools "Write,Edit,Bash,GlobTool,GrepTool"
```

This follows the principle of least privilege - only allow tools needed for the specific task.

### 3. Claude Code CLI Invocation Pattern

```python
import subprocess
import json

# Basic call
result = subprocess.run(
    ["claude", "--dangerouslyAllowAll", "Your prompt here"],
    capture_output=True,
    text=True,
    cwd="/path/to/workspace"
)

# With tool restrictions and JSON output
result = subprocess.run([
    "claude",
    "--allowedTools", "Write,Edit,Bash",
    "--outputFormat", "json",
    "--yes",  # Auto-approve non-sensitive operations
    "Create a TypeScript todo app"
], capture_output=True, text=True)

output = json.loads(result.stdout)
```

### 4. Multi-Step Workflows

Chain multiple Claude invocations for complex tasks:

```python
# Step 1: Read and analyze
step1 = subprocess.run([
    "claude",
    "--allowedTools", "GlobTool,GrepTool,ReadTool",
    "Read all Python files and identify key patterns"
], capture_output=True, text=True)

# Step 2: Generate based on analysis
step2 = subprocess.run([
    "claude",
    "--allowedTools", "Write,Edit",
    f"Based on this analysis: {step1.stdout}, add summaries to each file"
], capture_output=True, text=True)
```

### 5. Conversation State Management

Voice assistant maintains conversation history in YAML:

```yaml
- role: user
  content: "Create a new Python script"
- role: assistant
  content: "I'll create that script for you..."
  tool_calls: [...]
```

Stored in `output/conversation_YYYYMMDD_HHMMSS.yaml`

## Voice Assistant Usage

### Fast Voice Assistant (Recommended)

**Location**: `claude-assistant/voice_to_claude_code_fast.py`

**Features**:
- Wake word: "Hey Daisy"
- Local TTS (no OpenAI API needed)
- Non-blocking audio playback
- Tool allowlist for safety
- Conversation ID tracking
- Sound effects for feedback

**Start Command**:
```bash
cd claude-assistant
./start.sh
# OR
uv run voice_to_claude_code_fast.py
```

**Workflow**:
1. Say "Hey Daisy" to activate
2. Wait for wake sound
3. Speak your request
4. Claude processes and responds with voice
5. Tool usage indicated by sound effects

**Tool Allowlist** (configurable in script):
- `Bash`, `Edit`, `Glob`, `Grep`, `Read`, `Write`, `WebFetch`, `WebSearch`

**Working Directory**: `workspace/` (isolated workspace)

### Original Voice Assistant

**Location**: `voice_to_claude_code.py`

Requires both Anthropic and OpenAI API keys.

```bash
uv run voice_to_claude_code.py
```

## Common Workflows

### Creating a New Example Script

1. **Copy a similar example** as starting point
2. **Add UV dependencies** in `# ///` script section
3. **Set up environment variables** in `.env`
4. **Implement Claude CLI call** with appropriate tool restrictions
5. **Test with** `uv run script_name.py`

### Extending Voice Assistant

1. **Modify tool allowlist** in `voice_to_claude_code_fast.py`:
   ```python
   "--allowedTools", "Bash,Edit,Glob,Grep,Read,Write,WebFetch,WebSearch,YourNewTool"
   ```

2. **Add custom wake words** (browser speech recognition based)
3. **Customize sound effects** in `sounds/` directory
4. **Adjust working directory** with `--workingDirectory` flag

### Web Search Integration

Use `anthropic_search.py` for web searches with citations:

```bash
uv run anthropic_search.py "your search query" [--domains example.com]
```

Features:
- Web search with sources
- Domain filtering
- Location context support
- Rich formatted output

### Notion Integration Example

```bash
uv run claude_code_is_programmable_3.py "your_page_name"
```

Requires:
- Notion API key in `.env`
- `.mcp.json` configuration (see `.mcp.sample.json`)
- Page access permissions in Notion

## Branch Information

- **Main Branch**: `main`
- **Current Feature Branch**: `feature/non-blocking-tts`
- **Recent Work**:
  - Web Speech API wake word detection
  - Faster-whisper integration
  - Sound effect feedback system
  - Non-blocking TTS implementation

## Testing

Test suite located in `tests/`:

```bash
pytest tests/test_claude_testing_v1.py
```

## Best Practices

1. **Always restrict tools** - Use `--allowedTools` instead of `--dangerouslyAllowAll` in production
2. **Use UV for dependencies** - Inline dependency management keeps scripts portable
3. **Isolate workspaces** - Use `--workingDirectory` to contain Claude's operations
4. **Stream long operations** - Use `--outputFormat stream-json` for real-time feedback
5. **Version control conversations** - YAML conversation logs in `output/` are valuable debugging tools
6. **Test incrementally** - Start with simple scripts, progressively add complexity
7. **Monitor API usage** - Voice assistants can consume significant API tokens

## MCP Server Architecture

### The Problem

The traditional approach of invoking the `claude` CLI repeatedly has a significant performance issue:

```python
# Every call starts a fresh process - SLOW!
subprocess.run(["claude", "Create a file"])    # 3-5 seconds
subprocess.run(["claude", "Edit that file"])   # 3-5 seconds (lost context!)
subprocess.run(["claude", "Run tests"])        # 3-5 seconds
```

Each invocation:
- Starts a new process from scratch
- Loses all conversation context
- Requires manually passing history back
- Incurs 3-5 second startup overhead

### The Solution: MCP Server

The **Claude Code MCP Server** (`claude_code_mcp_server.py`) solves this by:

1. **Running as a persistent process** - Start once, use many times
2. **Maintaining conversation state in memory** - No context loss
3. **Exposing tools via MCP** - Standardized protocol for AI interactions
4. **Direct API usage** - Bypasses CLI overhead entirely

### Architecture

```
┌─────────────────────┐
│  Voice Assistant    │
│  or Custom Client   │
└──────────┬──────────┘
           │ MCP Protocol
           │ (stdin/stdout or HTTP)
           ▼
┌─────────────────────────────────────┐
│   Claude Code MCP Server            │
│   (Persistent Process)              │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Conversation Store          │   │
│  │ {                           │   │
│  │   "session-1": [...msgs],   │   │
│  │   "session-2": [...msgs]    │   │
│  │ }                           │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Anthropic API Client        │   │
│  │ (Direct API calls)          │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Tool Executors              │   │
│  │ - Bash, File Ops, etc.      │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Available Tools

The MCP server exposes these tools:

**Core Claude Interaction:**
- `execute_claude(prompt, conversation_id, working_directory)` - Main tool for AI requests

**Conversation Management:**
- `get_conversation_state(conversation_id)` - Get conversation metadata
- `list_conversations()` - List all active conversations
- `clear_conversation(conversation_id)` - Clear conversation history
- `get_conversation_history(conversation_id, limit)` - Retrieve message history

**Direct File Operations** (bypass Claude for speed):
- `quick_read_file(file_path, working_directory)` - Fast file read
- `quick_write_file(file_path, content, working_directory)` - Fast file write

**Resources:**
- `conversation://{conversation_id}` - Access conversation as MCP resource

### Usage Examples

**Starting the server:**
```bash
# Run directly
uv run claude_code_mcp_server.py

# Or install to Claude Desktop
uv run mcp install claude_code_mcp_server.py

# Or test with MCP Inspector
uv run mcp dev claude_code_mcp_server.py
```

**Using the client:**
```bash
# Run the example client
uv run claude_code_mcp_client.py
```

**In your own code:**
```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def use_claude_server():
    server_params = StdioServerParameters(
        command="uv",
        args=["run", "claude_code_mcp_server.py"]
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # Make requests without restarting!
            result = await session.call_tool(
                "execute_claude",
                arguments={
                    "prompt": "Create a Python script",
                    "conversation_id": "my-session"
                }
            )

            # Continue conversation with full context
            result = await session.call_tool(
                "execute_claude",
                arguments={
                    "prompt": "Now add error handling to it",
                    "conversation_id": "my-session"  # Same ID = same context
                }
            )
```

### Performance Comparison

**Traditional CLI approach:**
```
Request 1: 4.2s (fresh start)
Request 2: 4.1s (fresh start, manual history)
Request 3: 4.3s (fresh start, manual history)
Total: ~12.6s for 3 requests
```

**MCP Server approach:**
```
Server startup: 2.5s (one time)
Request 1: 0.8s (already running)
Request 2: 0.7s (has context)
Request 3: 0.8s (has context)
Total: ~4.8s for 3 requests (62% faster!)
```

### Integration with Voice Assistant

Update your voice assistant to use the MCP server instead of CLI:

```python
# OLD: Slow CLI approach
result = subprocess.run(["claude", prompt], ...)

# NEW: Fast MCP approach
result = await session.call_tool(
    "execute_claude",
    arguments={"prompt": prompt, "conversation_id": "voice-session"}
)
```

This dramatically reduces latency for voice interactions!

## Comparison: Claude Code vs Aider

This repo includes equivalent examples using Aider (alternative AI coding tool):

- **Claude Code**: More flexible, better for complex workflows, voice integration
- **Aider**: Focused on git-based workflows, good for code editing sessions

See `aider_is_programmable_*.{sh,py,js}` for equivalent examples.

## Related Documentation

- **README.md** - User-facing documentation and quick start
- **ai_docs/** - Comprehensive guides and tutorials
- **.aider.conf.yml** - Reference configuration for Aider users

## Troubleshooting

### Voice Assistant Issues

1. **Wake word not detected**:
   - Check PICOVOICE_ACCESS_KEY in `.env`
   - Verify microphone permissions

2. **TTS not working**:
   - Verify Piper TTS installation
   - Check audio output device
   - Test with: `echo "test" | piper --model en_US-lessac-medium --output_file test.wav`

3. **Claude Code not responding**:
   - Verify ANTHROPIC_API_KEY in `.env`
   - Check network connectivity
   - Review tool allowlist (ensure required tools are permitted)

### Common Errors

- **"Tool not allowed"** - Add missing tool to `--allowedTools` list
- **"API key not found"** - Check `.env` file and environment variables
- **"Command not found: claude"** - Install Claude Code CLI
- **UV import errors** - Run `uv sync` or verify dependencies in `# ///` section

## Development Guidelines

When modifying this codebase:

1. **Maintain progressive complexity** - Keep examples ordered from simple to advanced
2. **Document new patterns** - Add to this file and ai_docs/
3. **Test voice features** - Verify wake word, TTS, and conversation flow
4. **Update .env.sample** - Include any new required environment variables
5. **Keep tool restrictions** - Don't default to `--dangerouslyAllowAll`
6. **Preserve conversation logs** - Don't commit `output/*.yaml` but keep structure documented

## Quick Reference Commands

```bash
# Run MCP server (persistent Claude Code)
uv run claude_code_mcp_server.py

# Run MCP client examples
uv run claude_code_mcp_client.py

# Run fast voice assistant
cd claude-assistant && ./start.sh

# Run web search
uv run anthropic_search.py "search query"

# Run basic example
uv run claude_code_is_programmable_2.py

# Run tests
pytest tests/

# Reset demo artifacts
./reset.sh
```
