# Daisy Voice Assistant - Mount Management

This directory contains configuration files for managing external volume mounts in the Cassistant voice assistant.

## Files

- `mounts.yml` - Legacy mount configuration (not currently used)
- `docker-compose.override.yml` - Active mount configuration for Docker Compose
- `README.md` - This documentation

## How Mount Management Works

The voice assistant uses Docker Compose's automatic override functionality to dynamically add volume mounts without modifying the main `docker-compose.yml` file. This approach allows the assistant to modify mounts independently while keeping the main configuration clean.

## Complete Setup Instructions

### 1. Main Docker Compose Configuration

Ensure your main `docker-compose.yml` includes the cassistant service with basic configuration:

```yaml
services:
  cassistant:
    build: ./cassistant
    container_name: claude-assistant
    ports:
      - "8001:8000"
    environment:
      - ANTHROPIC_API_KEY=your-key-here
      - DEFAULT_WORKSPACE=/app/workspace
      - ALLOWED_WORKSPACE_PATHS=/app/workspace,/app/data
      - MCP_BASE_PATH=/app
      # ... other environment variables
    volumes:
      - ./cassistant/data:/app/data:z
      - ./cassistant/workspace:/app/workspace:z
    restart: unless-stopped
    networks:
      - selfhost
```

### 2. Create the Mount Management Directory

```bash
# From your selfhost directory
mkdir -p cassistant/workspace/.daisy
```

### 3. Create the Override File

Create `cassistant/workspace/.daisy/docker-compose.override.yml`:

```bash
# From the selfhost directory
cat > cassistant/workspace/.daisy/docker-compose.override.yml << 'EOF'
services:
  cassistant:
    volumes:
      # Read-only media and document access
      - /data/Media:/app/workspace/data/Media:ro
      - /data/Dropbox/Obsidian Vault:/app/workspace/data/Dropbox/Obsidian Vault:ro
      
      # Read-write files for assistant interaction
      - "/data/Dropbox/Obsidian Vault/📌 Pinned/🛒 Shopping List.md:/app/workspace/shopping-list.md"
      
      # Add new mounts here - voice assistant can modify this file!
      # Format: - /host/path:/app/workspace/container/path[:ro|:rw]
EOF
```

### 4. Create the Symlink

```bash
# From the selfhost directory  
ln -s cassistant/workspace/.daisy/docker-compose.override.yml docker-compose.override.yml
```

### 5. Verify the Setup

```bash
# Check the symlink
ls -la docker-compose.override.yml
# Should show: docker-compose.override.yml -> cassistant/workspace/.daisy/docker-compose.override.yml

# Verify Docker Compose can read both files
docker-compose config | grep -A 10 volumes

# Build and start the container
docker-compose up -d cassistant
```

### Adding New Mounts

Edit `cassistant/workspace/.daisy/docker-compose.override.yml`:

```yaml
services:
  cassistant:
    volumes:
      # Read-only media access
      - /data/Media:/app/workspace/data/Media:ro
      - /data/Dropbox/Obsidian Vault:/app/workspace/data/Dropbox/Obsidian Vault:ro
      
      # Read-write file access
      - "/data/Dropbox/Obsidian Vault/📌 Pinned/🛒 Shopping List.md:/app/workspace/shopping-list.md"
      
      # Add new mounts here:
      # - /host/path:/app/workspace/container/path[:ro|:rw]
```

### Mount Format

- **Read-only**: `- /host/path:/container/path:ro`
- **Read-write**: `- /host/path:/container/path` (or `:rw`)
- **Quoted paths**: Use quotes for paths with spaces or special characters

### Applying Changes

After editing the override file:

```bash
# Restart the container to apply new mounts
docker-compose restart cassistant

# Or rebuild and restart
docker-compose up -d cassistant
```

### Verifying Mounts

Check active mounts in the container:

```bash
# View all mounts
docker inspect claude-assistant | grep -A 20 '"Mounts"'

# Check specific mount inside container
docker exec claude-assistant ls -la /app/workspace/data/

# Test file access
docker exec claude-assistant cat /app/workspace/shopping-list.md
```

## Troubleshooting

### Common Issues

1. **Symlink not working**: Ensure the symlink path is relative from the directory where docker-compose is run:
   ```bash
   # Remove broken symlink
   rm docker-compose.override.yml
   # Recreate with relative path
   ln -s cassistant/workspace/.daisy/docker-compose.override.yml docker-compose.override.yml
   ```

2. **Path not found**: Verify source paths exist on host system:
   ```bash
   ls -la /data/Media
   ls -la "/data/Dropbox/Obsidian Vault"
   ```

3. **Permission denied**: Check file permissions and SELinux contexts:
   ```bash
   # For SELinux systems (like NixOS)
   ls -Z /data/Media
   ```

4. **Changes not applied**: Restart container after modifying override file:
   ```bash
   docker-compose restart cassistant
   ```

### Configuration Validation

```bash
# Check merged configuration
docker-compose config

# Validate specific service
docker-compose config --services | grep cassistant

# Check for syntax errors
docker-compose config --quiet || echo "Configuration has errors"
```

## Voice Assistant Integration

The voice assistant can modify `cassistant/workspace/.daisy/docker-compose.override.yml` directly to add new mounts dynamically. Changes take effect after container restart.

### Example Assistant Commands

- "Add a mount for /data/Projects to workspace/projects"
- "Mount my documents folder read-only" 
- "Remove the media mount"
- "List all current mounts"

## Security Considerations

- Use read-only mounts (`:ro`) for data that shouldn't be modified
- Limit mount paths to trusted directories
- Avoid mounting sensitive system directories
- Review mounts periodically for security compliance