#!/bin/bash

# Simple Claude Voice Assistant Startup
#
# Uses the "coding" profile from config/tool_allowlists/coding.yml

echo "🎤 Starting Claude Voice Assistant (Coding Profile)..."
echo ""

uv run python -m voice_assistant.main \
  --directory ./sandbox \
  --profile coding
