#!/usr/bin/env python3
"""
Simple script to get today's driving schedule
Uses the shared schedule logic from the MCP server
"""

import sys
import os
from datetime import datetime

# Add the project root to the path
script_dir = os.path.dirname(os.path.abspath(__file__))
workspace_dir = os.path.dirname(script_dir)
project_root = os.path.dirname(workspace_dir)
sys.path.insert(0, project_root)

try:
    # Import the shared drive schedule logic
    from src.mcp.drive_schedule_mcp.schedule_logic import calculate_driver
    
    # Get today's date
    today = datetime.now()
    
    # Calculate driver info using the same logic as the MCP server
    result = calculate_driver(today)
    
    # Format output
    if result['driver']:
        print(f"🚗 {result['description']}")
    else:
        print("🏠 No school drive today (weekend)")
        
except Exception as e:
    print(f"Error getting driving schedule: {e}")