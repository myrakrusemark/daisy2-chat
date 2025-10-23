#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "mcp>=1.0.0",
# ]
# ///

"""Quick test script to verify MCP server is working"""

import asyncio
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pathlib import Path

async def test_server():
    """Test the MCP server"""
    print("Connecting to MCP server...")

    server_script = Path(__file__).parent / "claude_code_mcp_server.py"

    server_params = StdioServerParameters(
        command="uv",
        args=["run", str(server_script)],
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            print("✓ Connected to MCP server")
            print("\nCalling execute_claude to list files in current directory...")

            result = await session.call_tool(
                "execute_claude",
                arguments={
                    "prompt": "List all files in the current working directory",
                    "conversation_id": "test-session",
                    "working_directory": str(Path.cwd())
                }
            )

            print("\n📋 Result:")
            if result.content and len(result.content) > 0:
                response_data = json.loads(result.content[0].text)
                print(f"\nResponse: {response_data.get('response')}")
                print(f"\nTool calls: {len(response_data.get('tool_calls', []))}")
            else:
                print("No response received")

if __name__ == "__main__":
    asyncio.run(test_server())
