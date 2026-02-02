#!/bin/bash
echo "[START SCRIPT] Starting Affret.IA API v2..."
echo "[START SCRIPT] Current directory: $(pwd)"
echo "[START SCRIPT] Files present:"
ls -la | head -20
echo "[START SCRIPT] Node version: $(node --version)"
echo "[START SCRIPT] NPM version: $(npm --version)"
echo "[START SCRIPT] Environment PORT: $PORT"
echo "[START SCRIPT] Launching node index.js..."
exec node index.js
