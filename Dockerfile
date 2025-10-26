# Multi-stage Dockerfile for Claude Assistant Web Interface
FROM python:3.11-slim as base

# Set working directory
WORKDIR /app

# Install system dependencies and Node.js for Claude CLI
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Copy pyproject.toml and install dependencies
COPY pyproject.toml uv.lock* ./
RUN pip install --no-cache-dir uv && \
    uv pip install --system -e .

# Copy application code
COPY src/ ./src/
COPY web/ ./web/
COPY config/ ./config/
COPY data/ ./data/
COPY sandbox/ ./sandbox/
COPY models/ ./models/
COPY .env ./.env

# Create necessary directories
RUN mkdir -p /app/data/conversations /app/data/sandbox /app/sandbox

# Create non-root user
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Install mcp-proxy as appuser
RUN uv tool install mcp-proxy

# Expose port
EXPOSE 8000

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=8000
ENV LOG_LEVEL=INFO
ENV PATH="/home/appuser/.local/bin:${PATH}"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')"

# Run the application
CMD ["python", "-m", "src.api.server"]
