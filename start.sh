#!/bin/bash

# Claude Voice Assistant Startup Script
#
# Starts the voice assistant with full tool access for personal use
# Uses the 'full' profile from config/tool_allowlists/full.yml

echo "🎤 Starting Claude Voice Assistant (Full Profile)..."
echo ""

# Start the voice assistant with full profile + custom trading tools
uv run python -m voice_assistant.main \
  --directory ./sandbox \
  --profile full \
  --allowedTools "Hass* GetLiveContext todo_get_items read_file read_text_file Read Edit Write Bash Glob Grep WebFetch WebSearch get_portfolio_status run_market_analysis get_trading_signals execute_minutely_check execute_quarterhour_analysis get_order_proposals approve_order reject_order get_account_summary check_policy_compliance get_market_status switch_account"
