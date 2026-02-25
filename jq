#!/bin/bash
# Wrapper pour jq.exe sur Windows
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/jq.exe" "$@"
