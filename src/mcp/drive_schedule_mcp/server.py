#!/usr/bin/env python3
"""
Drive Schedule MCP Server

Provides tools to check the driving schedule for Nova and Anna.
Schedule:
- Mondays: Myra drives Nova
- Tuesdays: Myra drives Nova and Anna
- Wednesdays: Myra drives Nova
- Thursdays: Kristann drives Nova and Anna
- Fridays: Alternating (Myra or Kristann drives Nova and Anna)
- Reference: Myra drove on Sept 12, 2025
"""

import logging
import sys
from datetime import datetime, timedelta
from typing import Any
from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Create server instance
server = Server("drive-schedule")

# Reference date for Friday alternation: September 12, 2025 (Myra drove)
REFERENCE_DATE = datetime(2025, 9, 12)


def calculate_driver(target_date: datetime) -> dict[str, Any]:
    """
    Calculate who drives on a given date.

    Args:
        target_date: The date to check

    Returns:
        Dictionary with driver information
    """
    day_name = target_date.strftime("%A")
    date_str = target_date.strftime("%Y-%m-%d")

    # Calculate Friday driver (alternates weekly)
    days_diff = (target_date - REFERENCE_DATE).days
    weeks_diff = days_diff // 7
    friday_driver = "Myra" if weeks_diff % 2 == 0 else "Kristann"

    # Determine driver based on day of week
    schedule = {
        "Monday": {
            "driver": "Myra",
            "passengers": ["Nova"],
            "description": "Myra drives Nova"
        },
        "Tuesday": {
            "driver": "Myra",
            "passengers": ["Nova", "Anna"],
            "description": "Myra drives Nova and Anna"
        },
        "Wednesday": {
            "driver": "Myra",
            "passengers": ["Nova"],
            "description": "Myra drives Nova"
        },
        "Thursday": {
            "driver": "Kristann",
            "passengers": ["Nova", "Anna"],
            "description": "Kristann drives Nova and Anna"
        },
        "Friday": {
            "driver": friday_driver,
            "passengers": ["Nova", "Anna"],
            "description": f"{friday_driver} drives Nova and Anna (alternating week)"
        },
        "Saturday": {
            "driver": None,
            "passengers": [],
            "description": "No school drive (weekend)"
        },
        "Sunday": {
            "driver": None,
            "passengers": [],
            "description": "No school drive (weekend)"
        }
    }

    result = schedule[day_name]
    result["date"] = date_str
    result["day"] = day_name

    return result


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """
    List available tools.
    """
    return [
        types.Tool(
            name="get_drive_schedule",
            description="Get the driving schedule for a specific date. Returns who drives and which kids (Nova and/or Anna). If no date is provided, automatically uses today's date.",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Optional date in YYYY-MM-DD format. Defaults to today's date if omitted.",
                    }
                },
            },
        ),
    ]


@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """
    Handle tool execution requests.
    """
    try:
        if name == "get_drive_schedule":
            # Get target date
            if arguments and "date" in arguments and arguments["date"]:
                try:
                    target_date = datetime.strptime(arguments["date"], "%Y-%m-%d")
                except ValueError:
                    return [
                        types.TextContent(
                            type="text",
                            text=f"Error: Invalid date format. Use YYYY-MM-DD format."
                        )
                    ]
            else:
                target_date = datetime.now()

            # Calculate driver
            result = calculate_driver(target_date)

            # Format response
            response = f"{result['day']}, {result['date']}\n\n{result['description']}"

            return [types.TextContent(type="text", text=response)]

        else:
            raise ValueError(f"Unknown tool: {name}")

    except Exception as e:
        logger.error(f"Error executing tool {name}: {e}", exc_info=True)
        return [
            types.TextContent(
                type="text",
                text=f"Error executing tool: {str(e)}"
            )
        ]


async def main():
    """Main entry point for the server."""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="drive-schedule",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
