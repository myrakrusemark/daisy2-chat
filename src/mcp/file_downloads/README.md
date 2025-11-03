# File Downloads MCP Server

Secure file download system that allows Claude Code to generate temporary, single-use download links for files and directories in the sandbox.

## Features

- 🔒 **Secure**: Temporary tokens with configurable expiry (1-60 minutes)
- 🔐 **Single-use**: Links are invalidated after one download
- 📁 **Directory support**: Automatically zips directories for download
- 🛡️ **Sandboxed**: Files must be within session working directory
- 📊 **Size limits**: Default 100MB limit to prevent abuse
- 🧹 **Auto-cleanup**: Background task removes expired tokens

## Security Model

### Path Validation
- All file paths are validated to be within the session's working directory
- Prevents directory traversal attacks (e.g., `../../etc/passwd`)
- Symlinks are resolved before validation

### Token System
- UUID4 tokens (122 bits of entropy) - brute force infeasible
- Single-use only - token deleted after download
- Time-limited expiry (default 5 minutes)
- Session-scoped - users can't access other session files

### Size Limits
- Default 100MB maximum per file/directory
- Configurable per-request
- Prevents disk space abuse

## Architecture

```
┌──────────────┐
│ Claude Code  │ (MCP Tool)
│              │ generate_download_link("/path/to/file")
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────┐
│  FastAPI Server                  │
│  POST /api/download/generate     │
│  - Validates path in sandbox     │
│  - Creates UUID token            │
│  - Returns download URL          │
└──────┬───────────────────────────┘
       │
       │ Returns: http://host/api/download/{token}
       ▼
┌──────────────┐
│ User Browser │ Opens link
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────┐
│  FastAPI Server                  │
│  GET /api/download/{token}       │
│  - Validates token               │
│  - Checks not expired/used       │
│  - Serves file or zip            │
│  - Deletes token (single-use)    │
└──────────────────────────────────┘
```

## Usage

### As an MCP Server

The file download MCP server is automatically available when Claude Code is running with the FastAPI server.

**Example usage in Claude Code:**

```
User: Generate a download link for my report
Claude: I'll create a download link for your report.

[Uses generate_download_link tool]

Claude: Here's your download link:
http://localhost:8000/api/download/abc123def456
This link expires in 5 minutes and can only be used once.
```

### MCP Tools

#### `generate_download_link`

Generate a secure, temporary download link for a file or directory.

**Parameters:**
- `path` (str): Path to file or directory (relative or absolute)
- `expiry_minutes` (int, optional): Minutes until expiry (default: 5, max: 60)

**Returns:**
- Download URL string

**Examples:**
```python
# Single file
url = generate_download_link("output/report.pdf")

# Directory (will be zipped)
url = generate_download_link("project/src", expiry_minutes=10)

# Absolute path
url = generate_download_link("/app/sandbox/data/export.csv")
```

#### `list_download_stats`

Get statistics about active download tokens.

**Returns:**
- Dictionary with token statistics

**Example:**
```python
stats = list_download_stats()
# {
#   "session_id": "abc123",
#   "working_directory": "/app/sandbox",
#   "statistics": {
#     "total_tokens": 5,
#     "active_tokens": 2,
#     "used_tokens": 2,
#     "expired_tokens": 1
#   }
# }
```

## API Endpoints

### `POST /api/download/generate`

Generate a download token.

**Request:**
```json
{
  "session_id": "abc123",
  "file_path": "output/report.pdf",
  "expiry_minutes": 5
}
```

**Response:**
```json
{
  "token": "def456",
  "download_url": "http://localhost:8000/api/download/def456",
  "expires_at": "2025-10-26T12:35:00",
  "file_type": "file",
  "message": "Download link generated successfully!..."
}
```

### `GET /api/download/{token}`

Download file using token.

**Response:**
- File download (application/octet-stream)
- Or zip archive for directories (application/zip)

### `GET /api/download/stats`

Get download statistics.

**Query Parameters:**
- `session_id` (optional): Filter by session

**Response:**
```json
{
  "statistics": {
    "total_tokens": 5,
    "active_tokens": 2,
    "used_tokens": 2,
    "expired_tokens": 1
  }
}
```

## Configuration

### Environment Variables

- `DOWNLOAD_API_URL`: API server URL (default: `http://localhost:8000`)
- `SESSION_ID`: Current session ID (set automatically)
- `WORKING_DIRECTORY`: Session working directory (set automatically)
- `BASE_URL`: Public base URL for download links (default: `http://localhost:8000`)

### Token Manager Settings

```python
download_manager = DownloadTokenManager(
    cleanup_interval=300  # Cleanup every 5 minutes
)

token = download_manager.create_token(
    file_path="data.csv",
    session_id="abc123",
    session_working_dir=Path("/app/sandbox"),
    expiry_minutes=5,      # Token lifetime
    max_size_mb=100        # Size limit (None for unlimited)
)
```

## Installation

The file download system is integrated into the main FastAPI server:

```python
# In src/api/server.py
from .download_manager import DownloadTokenManager

download_manager = DownloadTokenManager()
await download_manager.start_cleanup_task()
```

## Testing

```bash
# Start the FastAPI server
python -m src.api.server

# In another terminal, test the API
curl -X POST http://localhost:8000/api/download/generate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test123",
    "file_path": "README.md",
    "expiry_minutes": 5
  }'

# Use the returned URL to download
curl -O http://localhost:8000/api/download/{token}
```

## Security Considerations

### Safe for Production
✅ Path validation prevents directory traversal
✅ Single-use tokens prevent sharing
✅ Time limits reduce exposure window
✅ Session isolation prevents cross-session access
✅ Size limits prevent disk exhaustion

### Production Hardening
For production deployments, consider:

1. **Rate limiting**: Add rate limits to prevent token generation spam
2. **HTTPS only**: Enforce HTTPS for download URLs
3. **IP binding**: Optionally bind tokens to requesting IP
4. **Audit logging**: Log all token generation and downloads
5. **Size limits**: Tune max_size_mb based on your use case

## License

Part of the Claude Assistant project.
