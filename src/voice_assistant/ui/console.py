"""Console UI using Rich library"""

import json
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from rich.syntax import Syntax
from typing import Optional, Dict, Any


class AssistantUI:
    """Rich-based console UI for the assistant"""

    def __init__(self):
        self.console = Console()

    def show_banner(self, conversation_id: str, working_dir: str):
        """Show startup banner"""
        banner = f"""
[bold cyan]Claude Voice Assistant[/bold cyan]

[dim]Conversation ID:[/dim] {conversation_id}
[dim]Working Directory:[/dim] {working_dir}

[yellow]Say "hey daisy" to activate[/yellow]
[dim]Press Ctrl+C during listening to return to wake word[/dim]
        """
        self.console.print(Panel(banner.strip(), border_style="cyan"))

    def show_status(self, message: str, style: str = ""):
        """Show a status message"""
        self.console.print(f"[{style}]{message}[/{style}]")

    def show_listening(self):
        """Show listening indicator"""
        self.console.print("[yellow]🎤 Listening...[/yellow]")

    def show_processing(self):
        """Show processing indicator"""
        self.console.print("[blue]🤔 Processing...[/blue]")

    def show_tool_use(self, tool_name: str, tool_input: Dict[str, Any]):
        """Show real-time tool usage during streaming"""
        # Format tool message based on tool type and input
        if tool_name == "Bash" and "command" in tool_input:
            tool_msg = f"[Using {tool_name}: {tool_input['command']}]"
        elif "file_path" in tool_input:
            tool_msg = f"[Using {tool_name}: {tool_input['file_path']}]"
        elif "pattern" in tool_input:
            tool_msg = f"[Using {tool_name}: {tool_input['pattern']}]"
        else:
            tool_msg = f"[Using {tool_name}]"

        self.console.print(f"\n[dim cyan]{tool_msg}[/dim cyan]")

    def show_user_message(self, text: str):
        """Show user's transcribed message"""
        self.console.print(Panel(f"[bold green]You:[/bold green] {text}", border_style="green"))

    def show_assistant_message(self, text: str, tool_calls: Optional[list] = None):
        """Show assistant's response"""
        # Format response
        response_text = f"[bold cyan]Claude:[/bold cyan] {text}"

        # Add tool calls if present
        if tool_calls and len(tool_calls) > 0:
            self.console.print(Panel(response_text, border_style="cyan"))

            # Show tools used in a separate line
            tool_info = []
            for tool in tool_calls:
                name = tool.get("name", "unknown")
                count = tool.get("count")
                if count and count > 1:
                    tool_info.append(f"{name} ({count}x)")
                else:
                    tool_info.append(name)

            self.console.print(f"[dim]🔧 Tools: {', '.join(tool_info)}[/dim]")
        else:
            self.console.print(Panel(response_text, border_style="cyan"))

    def show_error(self, error: str):
        """Show error message"""
        self.console.print(Panel(f"[bold red]Error:[/bold red] {error}", border_style="red"))

    def show_code(self, code: str, language: str = "python"):
        """Show syntax-highlighted code"""
        syntax = Syntax(code, language, theme="monokai", line_numbers=True)
        self.console.print(syntax)

    def show_markdown(self, text: str):
        """Show markdown-formatted text"""
        md = Markdown(text)
        self.console.print(md)

    def show_info(self, message: str):
        """Show info message"""
        self.console.print(f"[dim]{message}[/dim]")

    def show_success(self, message: str):
        """Show success message"""
        self.console.print(f"[green]✓[/green] {message}")

    def show_warning(self, message: str):
        """Show warning message"""
        self.console.print(f"[yellow]⚠[/yellow] {message}")

    def clear(self):
        """Clear the console"""
        self.console.clear()

    def rule(self, title: Optional[str] = None):
        """Draw a horizontal rule"""
        self.console.rule(title)
