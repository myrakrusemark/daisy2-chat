# Cassistant Migration Checklist

This checklist will help you set up the cassistant project on a new machine after migration.

## Prerequisites

Ensure the following are installed on the new machine:
- [ ] Docker and Docker Compose
- [ ] Git
- [ ] UV (Rust-based Python package manager) - `curl -LsSf https://astral.sh/uv/install.sh | sh`
- [ ] Node.js 20+ and npm

## Migration Steps

### 1. Transfer Project Files

- [ ] Copy the entire `/home/myra/cassistant` directory to the new machine
- [ ] Verify all files transferred successfully
- [ ] Expected size: ~310 MB (after cleanup)

### 2. Set Up External Dependencies

If you use external symlinks/mounts, set them up on the new machine:

- [ ] Mount or copy Dropbox SD card to appropriate location
- [ ] Update paths in `cassistant-sandbox/.mcp.json` if Dropbox location differs
- [ ] Verify symlinks in `cassistant-sandbox/` point to correct locations:
  - `applications/` → Dropbox applications folder
  - `ObsidianVault/` → Obsidian Vault location
  - `Gold.md` and `Shopping-List.md` symlinks

### 3. Update Configuration Files

#### Update `.env` file with new API keys and credentials:
- [ ] `ANTHROPIC_API_KEY` - Get from https://console.anthropic.com
- [ ] `OPENAI_API_KEY` - Get from https://platform.openai.com
- [ ] `PICOVOICE_ACCESS_KEY` - Get from https://console.picovoice.ai
- [ ] `PORCUPINE_ACCESS_KEY` - Same as Picovoice
- [ ] `GOOGLE_OAUTH_CLIENT_ID` - Google Cloud Console
- [ ] `GOOGLE_OAUTH_CLIENT_SECRET` - Google Cloud Console
- [ ] `PROTONMAIL_USERNAME` - Your ProtonMail username
- [ ] `PROTONMAIL_PASSWORD` - Your ProtonMail password
- [ ] Update workspace paths if different from `/home/myra/`

#### Update `cassistant-sandbox/.mcp.json`:
- [ ] Update hardcoded paths from old machine format:
  - Old: `/home/myra/claude-assistant/claude-code-is-programmable/...`
  - New: Update to correct paths on new machine
- [ ] Verify `homeAssistantJwt` token is still valid (or regenerate)
- [ ] Verify `tradingAgentUrl` is accessible

#### Update `docker-compose.yml` (if needed):
- [ ] Verify volume mount paths match new machine setup
- [ ] Update external mount paths for Dropbox/Obsidian if location changed
- [ ] Verify port 8001 is available (or change to different port)

### 4. Regenerate Dependencies

Navigate to the project directory and run:

```bash
cd /home/myra/cassistant

# Install Python dependencies
uv sync

# Install Node.js dependencies
npm install
```

Expected outcomes:
- [ ] `.venv/` directory created (~50 MB)
- [ ] `node_modules/` directory created (~340 MB)
- [ ] No errors during installation

### 5. Build and Start the Server

Use the management script (recommended):

```bash
# First build with production mode
./update-and-restart.sh --build

# Or for development mode with auto-rebuild
./update-and-restart.sh --build --dev
```

Alternative manual method (not recommended):
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### 6. Verify Installation

- [ ] Container is running: `docker ps | grep cassistant`
- [ ] Access web interface: http://localhost:8000
- [ ] Check logs for errors: `docker logs cassistant-web-1`
- [ ] Test API endpoint: `curl http://localhost:8000/api/health` (if available)
- [ ] Test MCP servers are accessible
- [ ] Verify symlink mounts are working inside container: `docker exec cassistant-web-1 ls -la /app/workspace`

### 7. Post-Migration Testing

- [ ] Test conversation functionality
- [ ] Test wake word detection (if using Picovoice)
- [ ] Test TTS functionality (Piper models should be present)
- [ ] Test MCP server integrations:
  - [ ] Google Workspace (Gmail, Calendar, Tasks)
  - [ ] ProtonMail
  - [ ] Weather
  - [ ] File downloads
  - [ ] Trading agent (if applicable)
- [ ] Verify access to mounted volumes (applications, Obsidian, etc.)

## Troubleshooting

### Common Issues

**Dependencies won't install:**
- Ensure UV and Node.js are properly installed
- Check internet connection
- Try clearing cache: `uv cache clean` and `npm cache clean --force`

**Docker build fails:**
- Check Docker daemon is running: `sudo systemctl status docker`
- Verify Dockerfile hasn't been modified
- Check available disk space: `df -h`

**MCP servers not working:**
- Verify `.env` file has all required credentials
- Check `cassistant-sandbox/.mcp.json` paths are correct
- Review MCP server logs in `src/mcp/` directories

**External mounts not accessible:**
- Verify symlinks in `cassistant-sandbox/` are valid
- Check `docker-compose.yml` volume mounts
- Ensure external drives (Dropbox SD) are mounted
- Use `./update-and-restart.sh` which auto-scans and updates mounts

**Port conflicts:**
- If port 8001 is in use, update `docker-compose.yml` ports section
- Check what's using the port: `sudo lsof -i :8001`

## Important Notes

- The `.env` file is gitignored and contains sensitive data - keep it secure
- Lock files (`uv.lock`, `package-lock.json`) ensure reproducible builds - don't delete
- Conversation history was cleared for fresh start on new machine
- TTS models (61 MB) are included - no need to re-download
- Use `./update-and-restart.sh` script instead of manual docker commands

## Migration Complete!

Once all checkboxes are marked, your cassistant server should be fully operational on the new machine.

For help or issues, refer to:
- Project documentation in `/docs/`
- Docker logs: `docker logs cassistant-web-1`
- Management script help: `./update-and-restart.sh --help`
