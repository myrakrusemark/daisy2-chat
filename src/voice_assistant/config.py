"""Configuration management for Claude Voice Assistant"""

import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional
from dotenv import load_dotenv
from .config_loader import load_tool_allowlist

# Load environment variables
load_dotenv()


@dataclass
class AudioConfig:
    """Audio processing configuration"""
    piper_model: Path = field(
        default_factory=lambda: Path.home() / ".local/share/piper/models/en_US-amy-low.onnx"
    )
    wake_word_model: Optional[Path] = field(
        default_factory=lambda: Path(__file__).parent.parent.parent / "assets" / "audio" / "hey-daisy_en_linux_v3_0_0.ppn"
    )
    enable_sound_effects: bool = field(default_factory=lambda: os.getenv("ENABLE_SOUND_EFFECTS", "true").lower() == "true")
    tts_speed: float = field(default_factory=lambda: float(os.getenv("TTS_SPEED", "1.3")))


@dataclass
class ClaudeConfig:
    """Claude Code configuration"""
    api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    model: str = "claude-sonnet-4-20250514"
    allowed_tools: List[str] = field(default_factory=lambda: [
        "Bash", "Read", "Edit", "Write", "GlobTool", "GrepTool", "LSTool", "Replace"
    ])
    permission_mode: str = "bypassPermissions"
    working_directory: Optional[Path] = None


@dataclass
class PicovoiceConfig:
    """Picovoice (Porcupine + Cheetah) configuration"""
    access_key: str = field(
        default_factory=lambda: os.getenv("PORCUPINE_ACCESS_KEY") or os.getenv("PICOVOICE_ACCESS_KEY", "")
    )
    wake_word: str = "hey daisy"


@dataclass
class AssistantConfig:
    """Main assistant configuration"""
    audio: AudioConfig = field(default_factory=AudioConfig)
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)
    picovoice: PicovoiceConfig = field(default_factory=PicovoiceConfig)

    conversation_id: Optional[str] = None
    working_directory: Path = field(default_factory=lambda: Path.cwd() / "sandbox")
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

    # Directories (relative to project root)
    project_root: Path = field(default_factory=lambda: Path(__file__).parent.parent.parent)

    @property
    def sounds_dir(self) -> Path:
        """Path to sound effects directory"""
        return self.project_root / "assets" / "audio"

    @property
    def conversations_dir(self) -> Path:
        """Path to conversation logs directory"""
        return self.project_root / "data" / "conversations"

    def validate(self) -> List[str]:
        """Validate configuration and return list of errors"""
        errors = []

        if not self.claude.api_key:
            errors.append("ANTHROPIC_API_KEY is required")

        if not self.picovoice.access_key:
            errors.append("PORCUPINE_ACCESS_KEY or PICOVOICE_ACCESS_KEY is required")

        if not self.audio.piper_model.exists():
            errors.append(f"Piper model not found at {self.audio.piper_model}")

        return errors


# Sound file paths (computed from config)
def get_sound_paths(config: AssistantConfig):
    """Get paths to all sound effect files"""
    sounds_dir = config.sounds_dir
    return {
        "wake_word": sounds_dir / "wake-word.mp3",
        "wake": sounds_dir / "wake.mp3",
        "tool": sounds_dir / "tool.mp3",
        "wait": sounds_dir / "wait.mp3",
        "sleep": sounds_dir / "sleep.mp3",
    }


# Prompt templates
CLAUDE_PROMPT_TEMPLATE = """
# Voice-Enabled Claude Code Assistant

You are a helpful assistant that's being used via voice commands. Execute the user's request using your tools.

CRITICAL: Your responses will be read aloud via text-to-speech. Follow these rules STRICTLY:

1. **NO MARKDOWN** - Never use *, **, #, `, [], (), or any markdown formatting
2. **NO EMOJIS** - Never include emojis (🌤️, ✅, 🎉, etc.) in your response
3. **NO SYMBOLS** - Use words: say "degrees" not "°", "percent" not "%"
4. **Keep it conversational** - Write exactly how you would speak it aloud
5. **Be concise** - Voice responses should be brief and to the point

Examples:
- BAD: "**Today:** 65°F 🌤️"
- GOOD: "Today's high is 65 degrees and sunny"

- BAD: "I've created `app.py` with **3 functions**"
- GOOD: "I've created app dot py with three functions"

When describing code you've written:
- Just say "I've created [brief description]"
- Don't read out file paths or code syntax
- Focus on what it does, not how it looks

When providing information (like weather):
- Present facts naturally as if speaking
- No bullet points, just sentences
- No special formatting

{formatted_history}

Now help the user with their latest request. Remember: write EXACTLY how it should be spoken aloud.
"""


def create_default_config(
    conversation_id: Optional[str] = None,
    working_directory: Optional[Path] = None,
    allowed_tools: Optional[List[str]] = None,
    permission_mode: Optional[str] = None,
    tool_profile: Optional[str] = None,
) -> AssistantConfig:
    """
    Create a configuration with optional overrides

    Args:
        conversation_id: Conversation ID to resume
        working_directory: Working directory for Claude operations
        allowed_tools: List of allowed tools (overrides profile)
        permission_mode: Permission mode (overrides profile)
        tool_profile: Name of tool allowlist profile to load (safe, coding, full)
    """
    config = AssistantConfig()

    # Load tool profile if specified
    if tool_profile:
        profile_config = load_tool_allowlist(tool_profile)
        config.claude.allowed_tools = profile_config["allowed_tools"]
        config.claude.permission_mode = profile_config["permission_mode"]

    if conversation_id:
        config.conversation_id = conversation_id

    if working_directory:
        config.working_directory = Path(working_directory)
        config.claude.working_directory = Path(working_directory)

    # These override the profile if provided
    if allowed_tools:
        config.claude.allowed_tools = allowed_tools

    if permission_mode:
        config.claude.permission_mode = permission_mode

    return config
