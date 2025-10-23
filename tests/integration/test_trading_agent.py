#!/usr/bin/env python3
# /// script
# dependencies = [
#   "mcp>=1.1.2",
# ]
# ///

"""
Test script for the updated approve_order functionality in the Trading Agent MCP server.

This script tests:
1. Getting pending orders
2. Approving an order with all required fields
"""

import asyncio
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def test_approve_order():
    """Test the approve_order tool with the updated schema."""

    # Start the MCP server
    server_params = StdioServerParameters(
        command="uv",
        args=["run", "trading_agent_mcp_server.py"],
        env={"TRADING_AGENT_URL": "http://trade.myrakrusemark.com"}
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize
            await session.initialize()

            print("=== Testing Trading Agent MCP Server ===\n")

            # Test 1: Get pending orders
            print("1. Getting pending orders...")
            try:
                result = await session.call_tool("get_pending_orders", arguments={})
                print(f"✓ get_pending_orders works!")
                for content in result.content:
                    if hasattr(content, 'text'):
                        data = json.loads(content.text.split('\n', 1)[1])  # Skip title line
                        print(f"  Found {data.get('count', 0)} pending orders")
                        if data.get('pending_orders'):
                            print(f"  First order: {data['pending_orders'][0]}")
            except Exception as e:
                print(f"✗ get_pending_orders failed: {e}")

            print()

            # Test 2: Get order history to find a pending order
            print("2. Getting order history to find pending orders...")
            try:
                result = await session.call_tool("get_order_history", arguments={"limit": 10})
                print(f"✓ get_order_history works!")
                for content in result.content:
                    if hasattr(content, 'text'):
                        data = json.loads(content.text.split('\n', 1)[1])  # Skip title line
                        orders = data.get('orders', [])
                        pending_orders = [o for o in orders if not o.get('executed') and o.get('reason') == 'Algorithm proposal']

                        if pending_orders:
                            print(f"  Found {len(pending_orders)} pending algorithm proposals")
                            order = pending_orders[0]
                            print(f"  Example order:")
                            print(f"    ID: {order['id']}")
                            print(f"    Symbol: {order['symbol']}")
                            print(f"    Side: {order['side']}")
                            print(f"    Quantity: {order['quantity']}")
                            print(f"    Estimated $: {order['estimated_dollars']}")
                        else:
                            print(f"  No pending algorithm proposals found")
                            print(f"  Total orders: {len(orders)}")
            except Exception as e:
                print(f"✗ get_order_history failed: {e}")

            print()

            # Test 3: List available tools to verify schema
            print("3. Checking tool schemas...")
            try:
                tools = await session.list_tools()
                approve_tool = next((t for t in tools.tools if t.name == "approve_order"), None)
                if approve_tool:
                    print("✓ approve_order tool found!")
                    print(f"  Description: {approve_tool.description[:100]}...")
                    print(f"  Required fields: {approve_tool.inputSchema.get('required', [])}")
                else:
                    print("✗ approve_order tool not found!")
            except Exception as e:
                print(f"✗ list_tools failed: {e}")

            print()
            print("=== Test Complete ===")
            print("\nNOTE: To actually approve an order, use:")
            print("  await session.call_tool('approve_order', arguments={")
            print("    'symbol': 'UNH',")
            print("    'side': 'sell',")
            print("    'quantity': 18,")
            print("    'estimated_dollars': 6642.0,")
            print("    'order_id': '1766'  # optional, for tracking")
            print("  })")


if __name__ == "__main__":
    asyncio.run(test_approve_order())
