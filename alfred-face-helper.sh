#!/bin/bash

# Alfred Face Helper Script
# Quick commands to update your Face dashboard

AGENT_ID="alfred"
FACE_URL="http://localhost:3334"

function alfred() {
  case "$1" in
    working)
      curl -s -X POST "$FACE_URL/api/status/$AGENT_ID" \
        -H "Content-Type: application/json" \
        -d "{\"status\":\"working\",\"task\":\"$2\",\"detail\":\"$3\"}" > /dev/null
      echo "✅ Status: working on '$2'"
      ;;
    online)
      curl -s -X POST "$FACE_URL/api/status/$AGENT_ID" \
        -H "Content-Type: application/json" \
        -d '{"status":"online","task":""}' > /dev/null
      echo "✅ Status: online (idle)"
      ;;
    log)
      curl -s -X POST "$FACE_URL/api/activity" \
        -H "Content-Type: application/json" \
        -d "{\"type\":\"task\",\"agent\":\"$AGENT_ID\",\"text\":\"$2\"}" > /dev/null
      echo "✅ Logged: $2"
      ;;
    *)
      echo "Usage:"
      echo "  alfred working 'Task Name' 'Optional Detail'"
      echo "  alfred online"
      echo "  alfred log 'Activity text'"
      ;;
  esac
}

# If called directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  alfred "$@"
fi
