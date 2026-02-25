#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR:$PATH"

echo "Script directory: $SCRIPT_DIR"
echo "PATH: $PATH"
echo "Testing jq.exe directly:"
echo '{"test": "value"}' | ./jq.exe '.test'

echo "Testing jq command:"
echo '{"test": "value"}' | jq.exe '.test'
