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
When providing information: Present facts naturally as sentences, no bullet points.

DOWNLOAD LINKS:
- When you generate a download link, the UI automatically displays it to the user
- DO NOT read out the download URL or mention expiration times
- Just say "I've created a download link for [filename]" and move on"""


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
        self.claude_needs_history = False  # Flag to track if subprocess needs history re-sent

        # Initialize Anthropic async client for tool summaries (if key provided)
        self.anthropic_client = None
        if anthropic_api_key:
            self.anthropic_client = anthropic.AsyncAnthropic(api_key=anthropic_api_key)

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
            if self.claude_process and self.claude_process.returncode is None:
                log.info("Persistent Claude process already running")
                return

            # Clean up old process if it exists
            if self.claude_process:
                try:
                    self.claude_process.terminate()
                    await self.claude_process.wait()
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

            # Use asyncio subprocess for non-blocking I/O
            self.claude_process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self.working_directory)
            )

            # Wait a moment for initialization
            await asyncio.sleep(0.2)

            log.info(f"Persistent Claude process started (PID: {self.claude_process.pid})")

    async def _summarize_and_update(self, tool_name: str, tool_input: dict, callback: Optional[Callable]):
        """
        Background task: Generate summary and call callback with better description.
        This runs concurrently without blocking the main stdout reading loop.
        """
        if not callback:
            return

        try:
            summary = await self.summarize_tool_use(tool_name, tool_input)
            # Call the summary update callback with the better description
            await callback(tool_name, tool_input, summary)
            log.info(f"Generated and sent summary for {tool_name}: {summary}")
        except Exception as e:
            log.error(f"Error in background summarization: {e}")

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

            # Call Claude Haiku for fast summary (async)
            message = await self.anthropic_client.messages.create(
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
        on_tool_summary_update: Optional[Callable[[str, dict, str], None]] = None,
        on_text_block: Optional[Callable[[str], None]] = None,
        on_tool_input_progress: Optional[Callable[[str, str, dict], None]] = None,
        on_thinking_block: Optional[Callable[[str], None]] = None,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        is_interrupted: Optional[Callable[[], bool]] = None
    ) -> Dict[str, Any]:
        """
        Execute a Claude Code request with streaming output

        Args:
            prompt: User prompt to send to Claude
            on_tool_use: Callback when a tool is used (tool_name, tool_input, summary)
            on_tool_summary_update: Callback when better summary is ready (delayed)
            on_text_block: Callback when a text content block is received (text)
            on_tool_input_progress: Callback for incremental tool input construction (tool_id, partial_json, current_input)
            on_thinking_block: Callback when Claude reasoning content is received (thinking_text)
            conversation_history: Optional conversation history for context
            is_interrupted: Callable that returns True if execution should stop

        Returns:
            Dict containing response text and metadata
        """
        # Ensure process is running
        await self._start_persistent_claude()

        # If subprocess was restarted, re-send conversation history
        if self.claude_needs_history and conversation_history:
            log.info(f"Re-sending conversation history ({len(conversation_history)} messages)")
            try:
                for msg in conversation_history:
                    role = msg.get("role", "user")
                    content = msg.get("content", "")

                    # Format each historical message
                    history_message = {
                        "type": "user" if role == "user" else "assistant",
                        "message": {
                            "role": role,
                            "content": [{"type": "text", "text": content}]
                        }
                    }

                    # Send historical message
                    history_bytes = (json.dumps(history_message) + "\n").encode('utf-8')
                    self.claude_process.stdin.write(history_bytes)
                    await self.claude_process.stdin.drain()

                log.info("Conversation history re-sent successfully")
            except Exception as e:
                log.error(f"Error re-sending conversation history: {e}")

            # Reset flag after sending history
            self.claude_needs_history = False

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
            message_bytes = (json.dumps(json_message) + "\n").encode('utf-8')
            self.claude_process.stdin.write(message_bytes)
            await self.claude_process.stdin.drain()
            log.info("Sent message to persistent Claude process")
        except (BrokenPipeError, OSError) as e:
            log.error(f"Failed to write to Claude process: {e}")
            # Process died, restart and retry
            self.claude_process = None
            self.claude_needs_history = True  # New subprocess will need history
            await self._start_persistent_claude()

            # Re-send conversation history before retrying
            if conversation_history:
                log.info(f"Re-sending conversation history after crash ({len(conversation_history)} messages)")
                for msg in conversation_history:
                    role = msg.get("role", "user")
                    content = msg.get("content", "")
                    history_message = {
                        "type": "user" if role == "user" else "assistant",
                        "message": {
                            "role": role,
                            "content": [{"type": "text", "text": content}]
                        }
                    }
                    history_bytes = (json.dumps(history_message) + "\n").encode('utf-8')
                    self.claude_process.stdin.write(history_bytes)
                    await self.claude_process.stdin.drain()
                log.info("Conversation history re-sent after crash")
                self.claude_needs_history = False

            # Now retry sending the current message
            message_bytes = (json.dumps(json_message) + "\n").encode('utf-8')
            self.claude_process.stdin.write(message_bytes)
            await self.claude_process.stdin.drain()

        # Now stream the response and collect events
        final_result = None
        result_received = False
        tool_calls = []
        sent_text_blocks = []  # Track text blocks we've already sent
        last_text_block_callback = None  # Track the last text block callback to mark it as final

        # Read output line by line in real-time using async I/O
        try:
            while True:
                # Check for interruption/cancellation on every iteration
                if is_interrupted and is_interrupted():
                    log.info("Interrupted flag detected - stopping message processing")
                    return {
                        "success": False,
                        "response": "Request interrupted by user",
                        "tool_calls": tool_calls,
                    }

                # This allows the task to be interrupted immediately via CancelledError
                await asyncio.sleep(0)

                line_bytes = await self.claude_process.stdout.readline()
                if not line_bytes:
                    # EOF reached
                    break

                line = line_bytes.decode('utf-8').strip()
                if not line:
                    continue

                # Check again after reading - we might have been interrupted while blocked on readline
                if is_interrupted and is_interrupted():
                    log.info("Interrupted flag detected after reading - stopping message processing")
                    return {
                        "success": False,
                        "response": "Request interrupted by user",
                        "tool_calls": tool_calls,
                    }

                try:
                    # Parse JSON streaming output
                    event = json.loads(line)

                    # Check AGAIN immediately after parsing, before processing any events
                    if is_interrupted and is_interrupted():
                        log.info("Interrupted flag detected after parsing - stopping message processing")
                        return {
                            "success": False,
                            "response": "Request interrupted by user",
                            "tool_calls": tool_calls,
                        }

                    event_type = event.get("type")

                    # Handle system init event
                    if event_type == "system":
                        continue

                    # Handle assistant messages (for tool tracking and text blocks)
                    elif event_type == "assistant":
                        message = event.get("message", {})
                        content = message.get("content", [])

                        for item in content:
                            item_type = item.get("type")

                            if item_type == "text":
                                # Text content block (like "Sure, I'll help you...")
                                text = item.get("text", "").strip()
                                if text and on_text_block:
                                    # Check if interrupted before sending text block
                                    if is_interrupted and is_interrupted():
                                        log.info("Interrupted before text block")
                                        return {
                                            "success": False,
                                            "response": "Request interrupted by user",
                                            "tool_calls": tool_calls,
                                        }

                                    # Send text block to callback and track it
                                    await on_text_block(text, is_final=False)
                                    sent_text_blocks.append(text)
                                    # Store reference to potentially mark as final later
                                    last_text_block_callback = (text, on_text_block)

                            elif item_type == "tool_use":
                                # Tool usage notification
                                tool_name = item.get("name", "unknown")
                                tool_input = item.get("input", {})

                                # Track tool call
                                tool_calls.append({
                                    "name": tool_name,
                                    "id": item.get("id"),
                                    "input": tool_input
                                })

                                # Fire off callback immediately if provided (don't wait for summary)
                                if on_tool_use:
                                    # Check if interrupted before sending tool notification
                                    if is_interrupted and is_interrupted():
                                        log.info("Interrupted before tool notification")
                                        return {
                                            "success": False,
                                            "response": "Request interrupted by user",
                                            "tool_calls": tool_calls,
                                        }

                                    # Send immediate notification with basic info
                                    await on_tool_use(tool_name, tool_input, f"Using {tool_name}")

                                    # Then kick off background task to get better summary
                                    # This won't block the main loop
                                    asyncio.create_task(
                                        self._summarize_and_update(tool_name, tool_input, on_tool_summary_update)
                                    )

                    # Handle content block delta events (tool input progress and thinking)
                    elif event_type == "content_block_delta":
                        delta = event.get("delta", {})
                        delta_type = delta.get("type")
                        
                        if delta_type == "input_json_delta":
                            # Tool input construction progress
                            partial_json = delta.get("partial_json", "")
                            tool_id = event.get("index", "unknown")  # content block index
                            
                            if partial_json and on_tool_input_progress:
                                # Check if interrupted before sending progress
                                if is_interrupted and is_interrupted():
                                    log.info("Interrupted before tool input progress")
                                    return {
                                        "success": False,
                                        "response": "Request interrupted by user",
                                        "tool_calls": tool_calls,
                                    }
                                
                                # Try to parse current input state
                                try:
                                    current_input = json.loads(partial_json + "}")  # Attempt to close JSON
                                except json.JSONDecodeError:
                                    current_input = {}  # Fallback for incomplete JSON
                                
                                await on_tool_input_progress(str(tool_id), partial_json, current_input)
                        
                        elif delta_type == "thinking_delta":
                            # Claude reasoning content
                            thinking_text = delta.get("text", "")
                            
                            if thinking_text and on_thinking_block:
                                # Check if interrupted before sending thinking block
                                if is_interrupted and is_interrupted():
                                    log.info("Interrupted before thinking block")
                                    return {
                                        "success": False,
                                        "response": "Request interrupted by user",
                                        "tool_calls": tool_calls,
                                    }
                                
                                await on_thinking_block(thinking_text)

                    # Check for final result event
                    elif event_type == "result":
                        # Check if interrupted before processing final result
                        if is_interrupted and is_interrupted():
                            log.info("Interrupted before processing final result")
                            return {
                                "success": False,
                                "response": "Request interrupted by user",
                                "tool_calls": tool_calls,
                            }

                        final_result = event.get("result", "")
                        result_received = True
                        break

                except json.JSONDecodeError:
                    # Skip malformed lines
                    continue
                except Exception as e:
                    log.error(f"Error processing stream event: {e}")
                    continue

        except asyncio.CancelledError:
            log.info("Claude Code execution was cancelled")
            # Return partial result if available
            return {
                "success": False,
                "response": "Request cancelled by user",
                "tool_calls": tool_calls,
            }

        if result_received and final_result:
            # Check if this final result was already sent as a text block
            final_text = final_result.strip()
            already_sent = final_text in sent_text_blocks

            # If it was already sent, mark it as final
            if already_sent and last_text_block_callback:
                text, callback = last_text_block_callback
                if text == final_text:
                    # Resend as final to update the flag
                    await callback(final_text, is_final=True)

            return {
                "success": True,
                "response": final_text,
                "tool_calls": tool_calls,
                "already_sent_as_text_block": already_sent,
            }
        else:
            return {
                "success": False,
                "response": "No response received from Claude process",
                "tool_calls": tool_calls,
            }

    async def interrupt_and_restart(self):
        """
        Interrupt the current Claude Code request by killing the subprocess.
        It will automatically restart on the next request.
        Conversation context is preserved in the session.
        """
        async with self.claude_process_lock:
            if self.claude_process:
                log.info("Interrupting Claude Code - killing subprocess...")
                try:
                    # Kill it immediately (don't wait for graceful termination)
                    self.claude_process.kill()
                    await asyncio.wait_for(self.claude_process.wait(), timeout=1)
                except asyncio.TimeoutError:
                    log.warning("Subprocess didn't die after kill, forcing...")
                except Exception as e:
                    log.error(f"Error killing subprocess: {e}")

                self.claude_process = None
                self.claude_needs_history = True  # New subprocess will need history
                log.info("Claude Code subprocess killed - will restart on next request")

    async def cleanup(self):
        """Clean up persistent Claude process"""
        if self.claude_process:
            log.info("Terminating persistent Claude process...")
            try:
                self.claude_process.terminate()
                await asyncio.wait_for(self.claude_process.wait(), timeout=2)
            except asyncio.TimeoutError:
                self.claude_process.kill()
                await self.claude_process.wait()
            except:
                self.claude_process.kill()
            log.info("Persistent Claude process terminated")
