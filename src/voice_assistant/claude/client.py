"""Claude Code subprocess client wrapper"""

import logging
import subprocess
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
import anthropic

log = logging.getLogger(__name__)

# System prompt for voice-optimized responses
VOICE_SYSTEM_PROMPT = """You are a helpful assistant being used via voice commands.

CRITICAL: Your responses will be read aloud via text-to-speech. Follow these rules STRICTLY:

1. NO MARKDOWN - Never use *, **, #, `, [], (), or any markdown formatting
2. NO EMOJIS - Never include emojis in your response
3. NO SYMBOLS - Use words: say "degrees" not "°", "percent" not "%"
4. Keep it conversational - Write exactly how you would speak it aloud
5. Be concise - Voice responses should be brief and to the point

Examples:
- BAD: "**Today:** 65°F 🌤️"
- GOOD: "Today's high is 65 degrees and sunny"

When describing code: Just say what you did, not file paths or syntax.
When providing information: Present facts naturally as sentences, no bullet points."""


class ClaudeCodeClient:
    """Wrapper for invoking Claude Code CLI as a subprocess"""

    def __init__(
        self,
        working_directory: Path,
        allowed_tools: List[str],
        permission_mode: str = "bypassPermissions",
        anthropic_api_key: Optional[str] = None,
    ):
        """
        Initialize Claude Code client

        Args:
            working_directory: Directory for Claude to operate in
            allowed_tools: List of tool names to allow
            permission_mode: Permission mode (bypassPermissions, requireApproval)
            anthropic_api_key: API key for tool summarization (optional)
        """
        self.working_directory = Path(working_directory)
        self.allowed_tools = allowed_tools
        self.permission_mode = permission_mode
        self.claude_process = None  # Persistent subprocess for streaming
        self.claude_process_lock = asyncio.Lock()

        # Initialize Anthropic client for tool summaries (if key provided)
        self.anthropic_client = None
        if anthropic_api_key:
            self.anthropic_client = anthropic.Anthropic(api_key=anthropic_api_key)

        # Ensure working directory exists
        self.working_directory.mkdir(parents=True, exist_ok=True)

        log.info(f"Claude Code client initialized (working_dir: {self.working_directory})")

    def execute(
        self,
        prompt: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Execute a Claude Code request

        Args:
            prompt: User prompt to send to Claude
            conversation_history: Optional conversation history for context

        Returns:
            Dict containing response text and metadata
        """
        # Build Claude CLI command
        cmd = [
            "claude",
            "-p",  # Print mode (non-interactive)
            "--verbose",  # Get detailed output including tool usage
            "--allowedTools", " ".join(self.allowed_tools),
            "--permission-mode", self.permission_mode,
            "--system-prompt", VOICE_SYSTEM_PROMPT,
            "--output-format", "json",
            prompt
        ]

        log.debug(f"Executing Claude command: {' '.join(cmd)}")

        try:
            # Run Claude Code
            result = subprocess.run(
                cmd,
                cwd=str(self.working_directory),
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                log.error(f"Claude Code failed with return code {result.returncode}")
                log.error(f"stderr: {result.stderr}")
                return {
                    "success": False,
                    "response": f"Error: {result.stderr}",
                    "tool_calls": []
                }

            # Parse JSON output
            try:
                output = json.loads(result.stdout)
                all_events = output if isinstance(output, list) else [output]

                # Find the final result event and extract tool usage from all events
                result_obj = None
                tool_calls = []

                for event in all_events:
                    if isinstance(event, dict):
                        # Collect result
                        if event.get("type") == "result":
                            result_obj = event

                        # Extract tool usage from assistant messages
                        if event.get("type") == "assistant" and "message" in event:
                            message = event["message"]
                            if "content" in message and isinstance(message["content"], list):
                                for block in message["content"]:
                                    if isinstance(block, dict) and block.get("type") == "tool_use":
                                        tool_calls.append({
                                            "name": block.get("name", "unknown"),
                                            "id": block.get("id"),
                                            "input": block.get("input", {})
                                        })

                if not result_obj:
                    # No result found, use last object
                    result_obj = all_events[-1] if all_events else {}

                response_text = self._extract_response_text(result_obj)
                # Add any tool calls from summary if present
                summary_tools = self._extract_tool_calls(result_obj)
                if summary_tools:
                    tool_calls.extend(summary_tools)

                return {
                    "success": True,
                    "response": response_text,
                    "tool_calls": tool_calls,
                    "raw_output": output
                }

            except json.JSONDecodeError as e:
                log.error(f"Failed to parse Claude output as JSON: {e}")
                # Return stdout as plaintext fallback
                return {
                    "success": True,
                    "response": result.stdout,
                    "tool_calls": []
                }

        except subprocess.TimeoutExpired:
            log.error("Claude Code request timed out")
            return {
                "success": False,
                "response": "Request timed out after 120 seconds",
                "tool_calls": []
            }

        except Exception as e:
            log.error(f"Error executing Claude Code: {e}")
            return {
                "success": False,
                "response": f"Error: {str(e)}",
                "tool_calls": []
            }

    def _extract_response_text(self, output: Dict[str, Any]) -> str:
        """Extract human-readable response text from Claude output"""
        # Claude CLI JSON format has 'result' field
        if "result" in output:
            return output["result"]

        # Try other common formats
        if "response" in output:
            return output["response"]

        if "content" in output:
            if isinstance(output["content"], list):
                # Extract text from content blocks
                text_parts = []
                for block in output["content"]:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                return "\n".join(text_parts)
            return str(output["content"])

        if "text" in output:
            return output["text"]

        # Fallback: return entire output as JSON string
        return json.dumps(output, indent=2)

    def _extract_tool_calls(self, output: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract tool usage information from Claude output"""
        tool_calls = []

        # Check for tool_use_summary in the output
        if "tool_use_summary" in output:
            summary = output["tool_use_summary"]
            for tool_name, count in summary.items():
                if count > 0:
                    tool_calls.append({
                        "name": tool_name,
                        "count": count
                    })

        # Check for detailed tool usage in other fields
        if "tools_used" in output:
            for tool in output["tools_used"]:
                tool_calls.append({
                    "name": tool.get("name", "unknown"),
                    "input": tool.get("input", {})
                })

        return tool_calls

    async def _start_persistent_claude(self):
        """Start a persistent Claude Code process with stream-json I/O"""
        async with self.claude_process_lock:
            # Check if process already exists and is alive
            if self.claude_process and self.claude_process.poll() is None:
                log.info("Persistent Claude process already running")
                return

            # Clean up old process if it exists
            if self.claude_process:
                try:
                    self.claude_process.terminate()
                    self.claude_process.wait(timeout=2)
                except:
                    self.claude_process.kill()

            # Start new persistent process
            cmd = [
                "claude",
                "-p",
                "--input-format", "stream-json",
                "--output-format", "stream-json",
                "--verbose",  # Required for stream-json
                "--allowedTools", " ".join(self.allowed_tools),
                "--permission-mode", self.permission_mode,
                "--system-prompt", VOICE_SYSTEM_PROMPT,
            ]

            log.info(f"Starting persistent Claude process: {' '.join(cmd)}")

            self.claude_process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # Line buffered
                cwd=str(self.working_directory)
            )

            # Wait a moment for initialization
            await asyncio.sleep(0.2)

            log.info(f"Persistent Claude process started (PID: {self.claude_process.pid})")

    async def summarize_tool_use(self, tool_name: str, tool_input: dict) -> str:
        """Use Claude Haiku to summarize what a tool is doing"""
        if not self.anthropic_client:
            return f"Using {tool_name}"

        try:
            # Create a concise prompt for summarization
            prompt = f"""Summarize this action in one SHORT, SPECIFIC sentence (under 12 words) using present continuous tense (verb + -ing).

Tool: {tool_name}
Input: {json.dumps(tool_input, indent=2)}

Be SPECIFIC - include important details like:
- File/directory names or patterns
- Search terms or paths
- Key parameters

Examples:
- "Searching home folder for Python files"
- "Reading README.md file"
- "Listing contents of Photos directory"
- "Running git status in current repo"

Reply with ONLY the specific summary sentence starting with a verb ending in -ing, no extra words."""

            # Call Claude Haiku for fast summary
            message = self.anthropic_client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=50,
                messages=[{"role": "user", "content": prompt}]
            )

            summary = message.content[0].text.strip()
            return summary

        except Exception as e:
            log.error(f"Error summarizing tool use: {e}")
            # Fallback to simple message
            return f"Using {tool_name}"

    async def execute_streaming(
        self,
        prompt: str,
        on_tool_use: Optional[Callable[[str, dict, str], None]] = None,
        conversation_history: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Execute a Claude Code request with streaming output

        Args:
            prompt: User prompt to send to Claude
            on_tool_use: Callback when a tool is used (tool_name, tool_input, summary)
            conversation_history: Optional conversation history for context

        Returns:
            Dict containing response text and metadata
        """
        # Ensure process is running
        await self._start_persistent_claude()

        # Format message as stream-json
        json_message = {
            "type": "user",
            "message": {
                "role": "user",
                "content": [{"type": "text", "text": prompt}]
            }
        }

        # Send to Claude's stdin
        try:
            self.claude_process.stdin.write(json.dumps(json_message) + "\n")
            self.claude_process.stdin.flush()
            log.info("Sent message to persistent Claude process")
        except (BrokenPipeError, OSError) as e:
            log.error(f"Failed to write to Claude process: {e}")
            # Process died, restart and retry
            self.claude_process = None
            await self._start_persistent_claude()
            self.claude_process.stdin.write(json.dumps(json_message) + "\n")
            self.claude_process.stdin.flush()

        # Now stream the response and collect events
        final_result = None
        result_received = False
        tool_calls = []

        # Read output line by line in real-time
        for line in self.claude_process.stdout:
            if not line.strip():
                continue

            try:
                # Parse JSON streaming output
                event = json.loads(line.strip())
                event_type = event.get("type")

                # Handle system init event
                if event_type == "system":
                    continue

                # Handle assistant messages (for tool tracking)
                elif event_type == "assistant":
                    message = event.get("message", {})
                    content = message.get("content", [])

                    for item in content:
                        item_type = item.get("type")

                        if item_type == "tool_use":
                            # Tool usage notification
                            tool_name = item.get("name", "unknown")
                            tool_input = item.get("input", {})

                            # Generate summary if callback and client available
                            summary = await self.summarize_tool_use(tool_name, tool_input)

                            # Track tool call
                            tool_calls.append({
                                "name": tool_name,
                                "id": item.get("id"),
                                "input": tool_input
                            })

                            # Call callback if provided
                            if on_tool_use:
                                on_tool_use(tool_name, tool_input, summary)

                # Check for final result event
                elif event_type == "result":
                    final_result = event.get("result", "")
                    result_received = True
                    break

            except json.JSONDecodeError:
                # Skip malformed lines
                continue
            except Exception as e:
                log.error(f"Error processing stream event: {e}")
                continue

        if result_received and final_result:
            return {
                "success": True,
                "response": final_result.strip(),
                "tool_calls": tool_calls,
            }
        else:
            return {
                "success": False,
                "response": "No response received from Claude process",
                "tool_calls": tool_calls,
            }

    def cleanup(self):
        """Clean up persistent Claude process"""
        if self.claude_process:
            log.info("Terminating persistent Claude process...")
            try:
                self.claude_process.terminate()
                self.claude_process.wait(timeout=2)
            except:
                self.claude_process.kill()
            log.info("Persistent Claude process terminated")
