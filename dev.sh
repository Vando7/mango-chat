#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  npm install
fi

# Start the Vite dev server (ctrl+c stops it)
npm run dev
