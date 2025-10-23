#!/usr/bin/env python3
"""
Claude Voice Assistant - Main Entry Point

A fast voice-enabled Claude Code assistant with wake word detection,
real-time speech recognition, and local text-to-speech.
"""

import sys
import logging
import asyncio
import argparse
from pathlib import Path
from rich.console import Console
from rich.logging import RichHandler

from .config import create_default_config
from .assistant import VoiceAssistant


console = Console()


def setup_logging(level: str = "INFO"):
    """Configure logging"""
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(rich_tracebacks=True)]
    )

    # Suppress noisy loggers
    logging.getLogger("pvcheetah").setLevel(logging.WARNING)
    logging.getLogger("pvporcupine").setLevel(logging.WARNING)

    # Enable debug for Claude client to see what we're getting
    if level.upper() == "DEBUG":
        logging.getLogger("voice_assistant.claude.client").setLevel(logging.DEBUG)


def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description="Claude Voice Assistant - Voice-enabled AI coding assistant"
    )

    parser.add_argument(
        "-i", "--id",
        dest="conversation_id",
        help="Conversation ID to resume or create"
    )

    parser.add_argument(
        "-p", "--prompt",
        help="Initial prompt to process immediately"
    )

    parser.add_argument(
        "-d", "--directory",
        dest="working_directory",
        help="Working directory for Claude Code operations"
    )

    parser.add_argument(
        "--profile",
        dest="tool_profile",
        choices=["safe", "coding", "full"],
        help="Tool allowlist profile to use (safe, coding, full)"
    )

    parser.add_argument(
        "--allowedTools",
        dest="allowed_tools",
        help="Comma or space-separated list of allowed tools (overrides profile)"
    )

    parser.add_argument(
        "--permission-mode",
        dest="permission_mode",
        choices=["bypassPermissions", "requireApproval"],
        help="Permission mode for Claude Code operations (overrides profile)"
    )

    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level"
    )

    parser.add_argument(
        "--no-sounds",
        action="store_true",
        help="Disable sound effects"
    )

    return parser.parse_args()


def main():
    """Main entry point"""
    args = parse_args()

    # Setup logging
    setup_logging(args.log_level)

    # Parse allowed tools if provided
    allowed_tools = None
    if args.allowed_tools:
        # Split by comma or space
        allowed_tools = [
            tool.strip()
            for tool in args.allowed_tools.replace(",", " ").split()
            if tool.strip()
        ]

    # Create configuration
    config = create_default_config(
        conversation_id=args.conversation_id,
        working_directory=Path(args.working_directory) if args.working_directory else None,
        tool_profile=args.tool_profile,  # Load profile first
        allowed_tools=allowed_tools,      # Then override if specified
        permission_mode=args.permission_mode
    )

    # Disable sounds if requested
    if args.no_sounds:
        config.audio.enable_sound_effects = False

    # Validate configuration
    errors = config.validate()
    if errors:
        console.print("[bold red]Configuration errors:[/bold red]")
        for error in errors:
            console.print(f"  • {error}")
        console.print("\nPlease check your .env file and configuration.")
        sys.exit(1)

    # Create and run assistant
    try:
        assistant = VoiceAssistant(config, initial_prompt=args.prompt)
        asyncio.run(assistant.run())
    except KeyboardInterrupt:
        console.print("\n[dim]Goodbye![/dim]")
        sys.exit(0)
    except Exception as e:
        console.print(f"[bold red]Fatal error:[/bold red] {e}")
        logging.exception("Fatal error")
        sys.exit(1)


if __name__ == "__main__":
    main()
