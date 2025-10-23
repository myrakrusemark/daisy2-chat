#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "mcp>=1.0.0",
#   "python-dotenv",
# ]
# ///

"""
Test script for persistent Claude Code MCP server.

This tests that the Claude process stays alive between requests.
"""

import asyncio
import time
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def test_persistent_claude():
    """Test multiple requests to the same conversation to verify process persistence."""

    server_params = StdioServerParameters(
        command="uv",
        args=["run", "claude_code_mcp_server.py"]
    )

    print("🚀 Starting MCP server with persistent Claude Code...")

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            print("✅ MCP server initialized\n")

            # Test 1: First request (this will start a new Claude process)
            print("📝 Test 1: First request (creates new Claude process)")
            start_time = time.time()

            result1 = await session.call_tool(
                "execute_claude",
                arguments={
                    "prompt": "Create a file called test.txt with the content 'Hello from persistent Claude!'",
                    "conversation_id": "test-session"
                }
            )

            elapsed1 = time.time() - start_time
            print(f"⏱️  Time: {elapsed1:.2f}s")
            print(f"📤 Response: {result1.content[0].text[:200]}...\n")

            # Test 2: Second request (should reuse the same Claude process - FASTER!)
            print("📝 Test 2: Second request (reuses persistent Claude process)")
            start_time = time.time()

            result2 = await session.call_tool(
                "execute_claude",
                arguments={
                    "prompt": "Now read test.txt and tell me what it says",
                    "conversation_id": "test-session"  # Same session!
                }
            )

            elapsed2 = time.time() - start_time
            print(f"⏱️  Time: {elapsed2:.2f}s")
            print(f"📤 Response: {result2.content[0].text[:200]}...\n")

            # Test 3: Third request (still using same process)
            print("📝 Test 3: Third request (still using same process)")
            start_time = time.time()

            result3 = await session.call_tool(
                "execute_claude",
                arguments={
                    "prompt": "Delete test.txt",
                    "conversation_id": "test-session"
                }
            )

            elapsed3 = time.time() - start_time
            print(f"⏱️  Time: {elapsed3:.2f}s")
            print(f"📤 Response: {result3.content[0].text[:200]}...\n")

            # Performance analysis
            print("=" * 60)
            print("📊 Performance Analysis:")
            print(f"   Request 1 (cold start): {elapsed1:.2f}s")
            print(f"   Request 2 (warm):       {elapsed2:.2f}s")
            print(f"   Request 3 (warm):       {elapsed3:.2f}s")

            if elapsed2 < elapsed1 * 0.5:
                speedup = ((elapsed1 - elapsed2) / elapsed1) * 100
                print(f"\n🎉 SUCCESS! Request 2 was {speedup:.0f}% faster!")
                print("   ✅ Persistent Claude process is working!")
            else:
                print(f"\n⚠️  Warning: Request 2 not significantly faster")
                print("   ❌ Persistent process may not be working correctly")

            print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_persistent_claude())
