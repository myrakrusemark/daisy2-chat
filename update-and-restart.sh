#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="/home/myra/selfhost/daisy2/workspace"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
BUILD_FLAG=""

# Parse command line arguments
if [ "$1" = "--build" ]; then
    BUILD_FLAG="--build"
    echo "Build flag detected - will rebuild container image"
fi

echo "Scanning for symlinks in $WORKSPACE_DIR..."

# Find all symlinks and build volume mount entries
SYMLINK_MOUNTS=""
while IFS= read -r -d '' symlink; do
    # Get the symlink name (basename)
    link_name=$(basename "$symlink")

    # Get the target path
    target=$(readlink -f "$symlink")

    if [ -e "$target" ]; then
        echo "  Found: $link_name -> $target"
        # Add volume mount entry
        SYMLINK_MOUNTS+="      - $target:/app/workspace/$link_name:z\n"
    else
        echo "  Warning: $link_name points to non-existent target: $target"
    fi
done < <(find "$WORKSPACE_DIR" -maxdepth 1 -type l -print0)

# Create a temporary file with updated docker-compose.yml
TEMP_FILE=$(mktemp)

# Read the docker-compose.yml and replace the symlink mounts section
awk -v mounts="$SYMLINK_MOUNTS" '
/# Symlink targets mounted directly into workspace/ {
    print "      # Symlink targets mounted directly into workspace (auto-generated)"
    # Skip old mount lines until we hit a blank line or new section
    getline
    while (getline > 0 && /^      -.*:\/app\/workspace\//) {
        # Skip these lines
    }
    # Print the new mounts
    printf "%s", mounts
    # Print the current line (should be blank or new section)
    print
    next
}
{ print }
' "$COMPOSE_FILE" > "$TEMP_FILE"

# Check if there were any changes
if ! diff -q "$COMPOSE_FILE" "$TEMP_FILE" > /dev/null 2>&1; then
    echo ""
    echo "Updating docker-compose.yml with symlink mounts..."
    cp "$TEMP_FILE" "$COMPOSE_FILE"
    echo "docker-compose.yml updated."
else
    echo ""
    echo "No changes needed to docker-compose.yml."
fi

rm "$TEMP_FILE"

echo ""
if [ -n "$BUILD_FLAG" ]; then
    echo "Rebuilding and restarting container..."
    cd "$SCRIPT_DIR"
    docker-compose down
    docker-compose build
    docker-compose up -d
else
    echo "Restarting container..."
    cd "$SCRIPT_DIR"
    docker-compose down
    docker-compose up -d
fi

echo ""
echo "Container restarted successfully!"
echo ""
echo "Verifying mounts in container..."
docker exec daisy2 ls -lh /app/workspace/ | grep -E "^[dl-]" | head -20
