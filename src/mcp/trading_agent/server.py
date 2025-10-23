#!/usr/bin/env python3
# /// script
# dependencies = [
#   "mcp>=1.1.2",
#   "httpx>=0.28.1",
# ]
# ///

"""
Trading Agent MCP Server

Provides tools to interact with the Trading Agent API for portfolio monitoring,
order management, and trading operations.

Usage:
    uv run trading_agent_mcp_server.py

Available Tools:
    - get_portfolio: Get portfolio data for all accounts or specific account
    - get_health: Check trading agent health status
    - get_system_info: Get detailed system information
    - get_pending_orders: Get list of pending orders awaiting approval
    - approve_order: Approve and immediately execute a proposed order (places real market order!)
    - reject_order: Reject a proposed order
    - run_eod_report: Execute end-of-day reporting (all accounts or specific)
    - run_quarterly_refresh: Execute quarter-hour trading analysis (all accounts or specific)
    - run_minutely_check: Execute minutely risk monitoring (all accounts or specific)
    - get_activity_history: Get recent activity log entries
    - get_order_history: Get recent order history
    - get_portfolio_history: Get portfolio value history over time
    - get_stats: Get activity and trading statistics
    - list_accounts: List all configured trading accounts
"""

import os
import json
import logging
from typing import Any, Sequence
from datetime import datetime

import httpx
from mcp.server import Server
from mcp.types import (
    Resource,
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
    LoggingLevel
)
import mcp.server.stdio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trading-agent-mcp")

# Trading Agent API base URL
TRADING_AGENT_URL = os.environ.get("TRADING_AGENT_URL", "http://trade.myrakrusemark.com")

# Initialize MCP server
app = Server("trading-agent-mcp")

# HTTP client with timeout
http_client = httpx.Client(timeout=30.0)


def format_json_response(data: dict, title: str = None) -> str:
    """Format JSON data as readable text response."""
    lines = []
    if title:
        lines.append(f"=== {title} ===\n")
    lines.append(json.dumps(data, indent=2))
    return "\n".join(lines)


def handle_api_error(response: httpx.Response, operation: str) -> str:
    """Handle API error responses."""
    try:
        error_data = response.json()
        return f"Error during {operation}: {response.status_code}\n{json.dumps(error_data, indent=2)}"
    except Exception:
        return f"Error during {operation}: {response.status_code}\n{response.text}"


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available trading agent tools."""
    return [
        Tool(
            name="get_portfolio",
            description="Get portfolio data for a specific account. Returns holdings, positions, cash balances, and performance metrics. IMPORTANT: You must specify an account_id. Use list_accounts tool first to see available accounts (e.g., 'paper', 'live').",
            inputSchema={
                "type": "object",
                "properties": {
                    "account_id": {
                        "type": "string",
                        "description": "REQUIRED: Account ID to get portfolio data for. Use list_accounts to see available account IDs."
                    }
                },
                "required": ["account_id"]
            }
        ),
        Tool(
            name="get_health",
            description="Check the trading agent's health status. Returns system health indicators and any issues.",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        Tool(
            name="get_system_info",
            description="Get detailed system information including version, uptime, and configuration.",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        Tool(
            name="get_pending_orders",
            description="Get list of pending orders awaiting approval. Returns orders proposed by the algorithm that haven't been executed yet.",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        Tool(
            name="approve_order",
            description="Approve and immediately execute a proposed order. Use get_pending_orders or get_order_history first to find the order details. This will place a real market order! Requires ALL order fields: symbol, side, quantity, and estimated_dollars.",
            inputSchema={
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Stock symbol (e.g., 'UNH', 'QQQ', 'NVDA')"
                    },
                    "side": {
                        "type": "string",
                        "description": "Order side: 'buy' or 'sell'"
                    },
                    "quantity": {
                        "type": "integer",
                        "description": "Number of shares to trade"
                    },
                    "estimated_dollars": {
                        "type": "number",
                        "description": "Estimated dollar value of the trade"
                    },
                    "order_id": {
                        "type": "string",
                        "description": "Optional order ID for tracking (from get_pending_orders or get_order_history)"
                    }
                },
                "required": ["symbol", "side", "quantity", "estimated_dollars"]
            }
        ),
        Tool(
            name="reject_order",
            description="Reject a proposed order. Requires order ID from pending orders.",
            inputSchema={
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The ID of the order to reject"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Optional reason for rejecting the order"
                    },
                    "account_id": {
                        "type": "string",
                        "description": "Optional account ID for the order"
                    }
                },
                "required": ["order_id"]
            }
        ),
        Tool(
            name="run_eod_report",
            description="Execute end-of-day reporting. Generates daily summary and performance report. Can run for all accounts or a specific account.",
            inputSchema={
                "type": "object",
                "properties": {
                    "account_id": {
                        "type": "string",
                        "description": "Optional account ID. If not provided, runs for all enabled accounts."
                    }
                }
            }
        ),
        Tool(
            name="run_quarterly_refresh",
            description="Execute quarter-hour trading analysis. Performs market analysis and generates trading signals. Can run for all accounts or a specific account.",
            inputSchema={
                "type": "object",
                "properties": {
                    "account_id": {
                        "type": "string",
                        "description": "Optional account ID. If not provided, runs for all enabled accounts."
                    }
                }
            }
        ),
        Tool(
            name="run_minutely_check",
            description="Execute minutely risk monitoring. Checks positions and risk limits. Can run for all accounts or a specific account.",
            inputSchema={
                "type": "object",
                "properties": {
                    "account_id": {
                        "type": "string",
                        "description": "Optional account ID. If not provided, runs for all enabled accounts."
                    }
                }
            }
        ),
        Tool(
            name="get_activity_history",
            description="Get recent activity log entries. Shows trading actions, system events, and errors.",
            inputSchema={
                "type": "object",
                "properties": {
                    "hours": {
                        "type": "number",
                        "description": "Number of hours of history to retrieve (default: 24)"
                    },
                    "limit": {
                        "type": "number",
                        "description": "Maximum number of entries to return (default: 100)"
                    }
                }
            }
        ),
        Tool(
            name="get_order_history",
            description="Get recent order history. Shows executed, pending, and rejected orders.",
            inputSchema={
                "type": "object",
                "properties": {
                    "hours": {
                        "type": "number",
                        "description": "Number of hours of history to retrieve (default: 24)"
                    },
                    "limit": {
                        "type": "number",
                        "description": "Maximum number of orders to return (default: 50)"
                    }
                }
            }
        ),
        Tool(
            name="get_portfolio_history",
            description="Get portfolio value history over time. Shows how portfolio value has changed.",
            inputSchema={
                "type": "object",
                "properties": {
                    "hours": {
                        "type": "number",
                        "description": "Number of hours of history to retrieve (default: 168 = 1 week)"
                    },
                    "snapshot_type": {
                        "type": "string",
                        "description": "Type of snapshot: 'minutely', 'hourly', 'daily', 'eod' (default: all types)"
                    }
                }
            }
        ),
        Tool(
            name="get_stats",
            description="Get activity and trading statistics. Shows summary metrics and performance indicators.",
            inputSchema={
                "type": "object",
                "properties": {
                    "hours": {
                        "type": "number",
                        "description": "Number of hours for statistics calculation (default: 24)"
                    }
                }
            }
        ),
        Tool(
            name="list_accounts",
            description="List all configured trading accounts with their status and configuration.",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
    """Handle tool execution."""

    try:
        # Portfolio data
        if name == "get_portfolio":
            account_id = arguments.get("account_id")
            if not account_id:
                return [TextContent(
                    type="text",
                    text="Error: account_id is required. Use list_accounts tool first to see available accounts."
                )]

            url = f"{TRADING_AGENT_URL}/api/dashboard-mcp/{account_id}"
            title = f"Portfolio Data - Account {account_id}"

            response = http_client.get(url)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, title))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "get portfolio"))]

        # Health check
        elif name == "get_health":
            response = http_client.get(f"{TRADING_AGENT_URL}/health")
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, "Health Status"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "health check"))]

        # System info
        elif name == "get_system_info":
            response = http_client.get(f"{TRADING_AGENT_URL}/system-info")
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, "System Information"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "get system info"))]

        # Pending orders
        elif name == "get_pending_orders":
            response = http_client.get(f"{TRADING_AGENT_URL}/api/orders")
            if response.status_code == 200:
                data = response.json()
                pending = data.get("pending_orders", [])
                result = {
                    "pending_orders": pending,
                    "count": len(pending)
                }
                return [TextContent(type="text", text=format_json_response(result, "Pending Orders"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "get pending orders"))]

        # Approve order
        elif name == "approve_order":
            # Build payload with required fields
            payload = {
                "symbol": arguments["symbol"],
                "side": arguments["side"],
                "quantity": arguments["quantity"],
                "estimated_dollars": arguments["estimated_dollars"]
            }

            # Track order ID if provided (for logging/reference)
            order_id = arguments.get("order_id", "N/A")

            response = http_client.post(f"{TRADING_AGENT_URL}/api/orders/approve", json=payload)
            if response.status_code == 200:
                data = response.json()
                title = f"Order Approved & Executed - {payload['side'].upper()} {payload['quantity']} {payload['symbol']}"
                if order_id != "N/A":
                    title += f" (Proposed Order ID: {order_id})"
                if "order_id" in data:
                    title += f"\nBroker Order ID: {data['order_id']}"
                return [TextContent(type="text", text=format_json_response(data, title))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "approve order"))]

        # Reject order
        elif name == "reject_order":
            order_id = arguments["order_id"]
            payload = {"order_id": order_id}
            if "reason" in arguments:
                payload["reason"] = arguments["reason"]
            if "account_id" in arguments:
                payload["account_id"] = arguments["account_id"]

            response = http_client.post(f"{TRADING_AGENT_URL}/api/orders/reject", json=payload)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, f"Order {order_id} Rejected"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "reject order"))]

        # End-of-day report
        elif name == "run_eod_report":
            account_id = arguments.get("account_id")
            if account_id:
                url = f"{TRADING_AGENT_URL}/run/eod/{account_id}"
                title = f"EOD Report - Account {account_id}"
            else:
                url = f"{TRADING_AGENT_URL}/run/eod"
                title = "EOD Report - All Accounts"

            response = http_client.post(url)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, title))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "EOD report"))]

        # Quarterly refresh (quarter-hour analysis)
        elif name == "run_quarterly_refresh":
            account_id = arguments.get("account_id")
            if account_id:
                url = f"{TRADING_AGENT_URL}/run/quarterhour/{account_id}"
                title = f"Quarterly Analysis - Account {account_id}"
            else:
                url = f"{TRADING_AGENT_URL}/run/quarterhour"
                title = "Quarterly Analysis - All Accounts"

            response = http_client.post(url)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, title))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "quarterly refresh"))]

        # Minutely check
        elif name == "run_minutely_check":
            account_id = arguments.get("account_id")
            if account_id:
                url = f"{TRADING_AGENT_URL}/run/minutely/{account_id}"
                title = f"Minutely Check - Account {account_id}"
            else:
                url = f"{TRADING_AGENT_URL}/run/minutely"
                title = "Minutely Check - All Accounts"

            response = http_client.post(url)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, title))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "minutely check"))]

        # Activity history
        elif name == "get_activity_history":
            params = {}
            if "hours" in arguments:
                params["hours"] = arguments["hours"]
            if "limit" in arguments:
                params["limit"] = arguments["limit"]

            response = http_client.get(f"{TRADING_AGENT_URL}/api/activity-history", params=params)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, "Activity History"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "get activity history"))]

        # Order history
        elif name == "get_order_history":
            params = {}
            if "hours" in arguments:
                params["hours"] = arguments["hours"]
            if "limit" in arguments:
                params["limit"] = arguments["limit"]

            response = http_client.get(f"{TRADING_AGENT_URL}/api/order-history", params=params)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, "Order History"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "get order history"))]

        # Portfolio history
        elif name == "get_portfolio_history":
            params = {}
            if "hours" in arguments:
                params["hours"] = arguments["hours"]
            if "snapshot_type" in arguments:
                params["snapshot_type"] = arguments["snapshot_type"]

            response = http_client.get(f"{TRADING_AGENT_URL}/api/portfolio-history", params=params)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, "Portfolio History"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "get portfolio history"))]

        # Statistics
        elif name == "get_stats":
            params = {}
            if "hours" in arguments:
                params["hours"] = arguments["hours"]

            response = http_client.get(f"{TRADING_AGENT_URL}/api/stats", params=params)
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, "Trading Statistics"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "get statistics"))]

        # List accounts
        elif name == "list_accounts":
            response = http_client.get(f"{TRADING_AGENT_URL}/api/accounts")
            if response.status_code == 200:
                data = response.json()
                return [TextContent(type="text", text=format_json_response(data, "Trading Accounts"))]
            else:
                return [TextContent(type="text", text=handle_api_error(response, "list accounts"))]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    except httpx.RequestError as e:
        error_msg = f"Network error while calling {name}: {str(e)}\nPlease check if the Trading Agent API is accessible at {TRADING_AGENT_URL}"
        return [TextContent(type="text", text=error_msg)]
    except Exception as e:
        error_msg = f"Error executing {name}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return [TextContent(type="text", text=error_msg)]


@app.list_resources()
async def list_resources() -> list[Resource]:
    """List available resources."""
    return [
        Resource(
            uri="trading://dashboard",
            name="Trading Dashboard",
            mimeType="application/json",
            description="Real-time trading dashboard data for all accounts"
        ),
        Resource(
            uri="trading://health",
            name="System Health",
            mimeType="application/json",
            description="Trading agent health status and diagnostics"
        )
    ]


@app.read_resource()
async def read_resource(uri: str) -> str:
    """Read resource content."""
    try:
        if uri == "trading://dashboard":
            response = http_client.get(f"{TRADING_AGENT_URL}/api/dashboard-mcp")
            if response.status_code == 200:
                return json.dumps(response.json(), indent=2)
            else:
                return f"Error fetching dashboard: {response.status_code}"

        elif uri == "trading://health":
            response = http_client.get(f"{TRADING_AGENT_URL}/health")
            if response.status_code == 200:
                return json.dumps(response.json(), indent=2)
            else:
                return f"Error fetching health: {response.status_code}"

        else:
            return f"Unknown resource: {uri}"

    except Exception as e:
        return f"Error reading resource {uri}: {str(e)}"


async def main():
    """Run the MCP server."""
    logger.info(f"Starting Trading Agent MCP Server (API: {TRADING_AGENT_URL})")

    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
