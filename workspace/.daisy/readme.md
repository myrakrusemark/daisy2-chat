# Daisy Workspace Mirror

This directory contains tools for creating a local mirror of the Daisy assistant's Docker container workspace. This allows you to access the same files and folder structure that the containerized assistant sees, making development and file management much easier.

## Quick Start

```bash
# Run the sync script to create symlinks matching Docker mounts
./.daisy/sync-mounts.sh
```

## What It Does

The `sync-mounts.sh` script:

1. **Cleans** existing symlinks to ensure a fresh sync (excluding .daisy directory)
2. **Parses** the `docker-compose.override.yml` file from the parent selfhost directory
3. **Extracts** volume mount definitions for the cassistant service  
4. **Creates** symlinks in your workspace that mirror the container's `/app/workspace/` structure
5. **Maintains** the same read-only permissions as defined in the Docker configuration

## File Structure

After running the sync script, your workspace will contain symlinks that match exactly what the Daisy assistant sees inside the container:

```
workspace/
├── .daisy/
│   ├── sync-mounts.sh     # The sync script
│   └── readme.md          # This file
├── data/
│   ├── Media/             # -> /data/Media (read-only)
│   └── Dropbox/
│       └── Obsidian Vault/ # -> /data/Dropbox/Obsidian Vault (read-only)
├── shopping-list.md       # -> Shopping List.md from Obsidian
├── custody-details.md     # -> Custody document (read-only)  
└── nova-christmas-list.md # -> Nova's Christmas list
```

## Docker Mount Configuration

The script reads mount definitions from `../../docker-compose.override.yml`. Current mounts:

- **Read-only media access**: `/data/Media` and `/data/Dropbox/Obsidian Vault`
- **Editable files**: Shopping list and Nova's Christmas list  
- **Reference documents**: Custody details (read-only)

## Usage Tips

### Re-sync After Changes

Run the sync script again whenever you modify the Docker override file:

```bash
./.daisy/sync-mounts.sh
```

### Adding New Mounts

1. Edit `../../docker-compose.override.yml` and add your mount under the `cassistant.volumes` section:
   ```yaml
   - "/host/path:/app/workspace/container/path[:ro]"
   ```

2. Re-run the sync script to create the corresponding symlink

3. The comment in the override file encourages the voice assistant to modify this file directly when needed

### Read-only vs Read-write

- Files marked with `:ro` in Docker will be noted as read-only in the script output
- The assistant respects these permissions when working with files
- Symlinks themselves can't enforce read-only, but the underlying file permissions apply

## Troubleshooting

### Permission Issues

Make sure the script is executable:

```bash
chmod +x ./.daisy/sync-mounts.sh
```

### Host Paths Don't Exist

The script will warn about missing host paths but continue with available mounts. Check that your storage drives are properly mounted according to your system's CLAUDE.md configuration.

## Technical Details

### How It Works

1. **Clean Slate**: Removes all existing symlinks (except in .daisy directory) to ensure perfect sync
2. **YAML Parsing**: Uses pure bash with regex parsing to extract volume mounts from Docker Compose override file
3. **Path Resolution**: Strips `/app/workspace/` prefix from container paths to get relative workspace paths  
4. **Directory Creation**: Automatically creates parent directories as needed
5. **Symlink Creation**: Creates fresh symlinks matching the current mount configuration
6. **Error Handling**: Continues processing even if some host paths are missing

### File Safety

- Uses clean slate approach: removes all symlinks before recreating them
- Preserves the .daisy directory and any regular files
- Only processes mounts that target `/app/workspace/` 
- Validates host paths exist before creating symlinks
- Uses absolute paths to ensure reliability

This setup gives you the exact same file access as the Daisy assistant running in Docker, making development and file management seamless!