#!/usr/bin/env python3
# /// script
# dependencies = [
#   "mcp>=1.1.2",
#   "rich>=13.9.4",
# ]
# ///

"""
Trading Agent MCP Client Example

Demonstrates how to use the Trading Agent MCP Server to monitor portfolio,
manage orders, and execute trading operations.

Usage:
    uv run trading_agent_mcp_client.py
"""

import asyncio
import json
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import print as rprint

console = Console()


async def run_trading_client():
    """Run example trading client interactions."""

    console.print("\n[bold cyan]🤖 Trading Agent MCP Client[/bold cyan]\n")

    # Set up MCP server connection
    server_params = StdioServerParameters(
        command="uv",
        args=["run", "trading_agent_mcp_server.py"]
    )

    async with AsyncExitStack() as stack:
        # Connect to server
        streams = await stack.enter_async_context(stdio_client(server_params))
        read_stream, write_stream = streams

        # Create session
        session = await stack.enter_async_context(ClientSession(read_stream, write_stream))

        # Initialize
        await session.initialize()

        console.print("[green]✓[/green] Connected to Trading Agent MCP Server\n")

        # List available tools
        tools = await session.list_tools()
        console.print(f"[bold]Available Tools:[/bold] {len(tools.tools)}")
        for tool in tools.tools:
            console.print(f"  • {tool.name}: {tool.description[:80]}...")

        console.print("\n" + "="*80 + "\n")

        # Example 1: Check system health
        console.print("[bold yellow]1. Checking System Health...[/bold yellow]")
        health_result = await session.call_tool("get_health", arguments={})
        console.print(Panel(health_result.content[0].text, title="System Health"))

        # Example 2: Get portfolio data for all accounts
        console.print("\n[bold yellow]2. Getting Portfolio Data (All Accounts)...[/bold yellow]")
        portfolio_result = await session.call_tool("get_portfolio", arguments={})
        console.print(Panel(portfolio_result.content[0].text, title="Portfolio Data"))

        # Example 3: List accounts
        console.print("\n[bold yellow]3. Listing Trading Accounts...[/bold yellow]")
        accounts_result = await session.call_tool("list_accounts", arguments={})
        console.print(Panel(accounts_result.content[0].text, title="Trading Accounts"))

        # Example 4: Get recent activity
        console.print("\n[bold yellow]4. Getting Recent Activity (Last 24 hours)...[/bold yellow]")
        activity_result = await session.call_tool("get_activity_history", arguments={"hours": 24, "limit": 10})
        console.print(Panel(activity_result.content[0].text, title="Recent Activity"))

        # Example 5: Get trading statistics
        console.print("\n[bold yellow]5. Getting Trading Statistics...[/bold yellow]")
        stats_result = await session.call_tool("get_stats", arguments={"hours": 24})
        console.print(Panel(stats_result.content[0].text, title="Trading Statistics"))

        console.print("\n[bold green]✓ Examples completed successfully![/bold green]\n")

        # Interactive menu
        while True:
            console.print("\n[bold cyan]What would you like to do?[/bold cyan]")
            console.print("1. Check portfolio")
            console.print("2. Run EOD report")
            console.print("3. Run quarterly refresh")
            console.print("4. Get order history")
            console.print("5. Get portfolio history")
            console.print("6. Exit")

            choice = console.input("\n[bold]Enter choice (1-6): [/bold]")

            if choice == "1":
                result = await session.call_tool("get_portfolio", arguments={})
                console.print(Panel(result.content[0].text, title="Portfolio Data"))

            elif choice == "2":
                console.print("[yellow]Running EOD report for all accounts...[/yellow]")
                result = await session.call_tool("run_eod_report", arguments={})
                console.print(Panel(result.content[0].text, title="EOD Report"))

            elif choice == "3":
                console.print("[yellow]Running quarterly refresh for all accounts...[/yellow]")
                result = await session.call_tool("run_quarterly_refresh", arguments={})
                console.print(Panel(result.content[0].text, title="Quarterly Refresh"))

            elif choice == "4":
                hours = console.input("[bold]Hours of history (default 24): [/bold]") or "24"
                result = await session.call_tool("get_order_history", arguments={"hours": int(hours)})
                console.print(Panel(result.content[0].text, title="Order History"))

            elif choice == "5":
                hours = console.input("[bold]Hours of history (default 168): [/bold]") or "168"
                result = await session.call_tool("get_portfolio_history", arguments={"hours": int(hours)})
                console.print(Panel(result.content[0].text, title="Portfolio History"))

            elif choice == "6":
                console.print("\n[bold green]Goodbye![/bold green]\n")
                break

            else:
                console.print("[bold red]Invalid choice. Please try again.[/bold red]")


if __name__ == "__main__":
    asyncio.run(run_trading_client())
