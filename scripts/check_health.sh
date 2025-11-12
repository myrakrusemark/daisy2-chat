#!/bin/bash
#
# Quick health check script for Cassistant
# Shows current health status and recent health check results
#

set -e

CONTAINER_NAME="claude-assistant"

echo "🏥 Cassistant Health Status"
echo "=========================="

# Check if container is running
if ! docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ Container '${CONTAINER_NAME}' is not running!"
    echo ""
    echo "Available containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
    exit 1
fi

# Get current health status
HEALTH_STATUS=$(docker inspect ${CONTAINER_NAME} --format="{{.State.Health.Status}}")
echo "Current Status: ${HEALTH_STATUS}"

# Show status with appropriate emoji
case ${HEALTH_STATUS} in
    "healthy")
        echo "✅ Container is healthy!"
        ;;
    "unhealthy") 
        echo "❌ Container is unhealthy!"
        ;;
    "starting")
        echo "⏳ Health checks starting..."
        ;;
    *)
        echo "❓ Unknown health status: ${HEALTH_STATUS}"
        ;;
esac

echo ""
echo "📋 Recent Health Check Results:"
echo "================================"

# Get recent health check logs (last 3 entries)
docker inspect ${CONTAINER_NAME} \
    --format="{{range .State.Health.Log}}{{.Start}} | {{.ExitCode}} | {{.Output}}{{end}}" \
    | tail -3 \
    | while IFS='|' read -r timestamp exit_code output; do
        # Format timestamp
        formatted_time=$(date -d "${timestamp}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "${timestamp}")
        
        # Format exit code
        if [ "${exit_code// /}" = "0" ]; then
            status_icon="✅"
            status_text="PASS"
        else
            status_icon="❌" 
            status_text="FAIL"
        fi
        
        echo "${status_icon} ${formatted_time} | ${status_text}"
        
        # Show output if it's a failure or if verbose mode
        if [ "${exit_code// /}" != "0" ] || [ "$1" = "-v" ]; then
            echo "   Output: ${output// /}"
            echo ""
        fi
    done

echo ""
echo "🔧 Quick Commands:"
echo "=================="
echo "Run health check manually:"
echo "  docker exec ${CONTAINER_NAME} python /app/scripts/health_check.py"
echo ""
echo "Run full test suite:"
echo "  docker exec ${CONTAINER_NAME} python /app/scripts/run_tests.py --fast"
echo ""
echo "Check detailed logs:"
echo "  docker logs ${CONTAINER_NAME} --tail=20"
echo ""
echo "Monitor health status continuously:"
echo "  watch -n 5 'docker inspect ${CONTAINER_NAME} --format=\"{{.State.Health.Status}}\"'"