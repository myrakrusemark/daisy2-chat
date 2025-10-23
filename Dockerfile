# Multi-stage Dockerfile for Claude Assistant Web Interface
FROM python:3.11-slim as base

# Set working directory
WORKDIR /app

# Install system dependencies (minimal - no audio libraries needed!)
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

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

# Create necessary directories
RUN mkdir -p /app/data/conversations /app/data/sandbox /app/sandbox

# Expose port
EXPOSE 8000

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=8000
ENV LOG_LEVEL=INFO

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')"

# Run the application
CMD ["python", "-m", "api.server"]
