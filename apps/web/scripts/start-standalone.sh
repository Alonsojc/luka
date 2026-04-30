#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

standalone_app_dir=".next/standalone/apps/web"

if [ ! -f "$standalone_app_dir/server.js" ]; then
  echo "Standalone server not found at $standalone_app_dir/server.js. Run pnpm --filter @luka/web build first." >&2
  exit 1
fi

mkdir -p "$standalone_app_dir/.next"

if [ -d ".next/static" ]; then
  rm -rf "$standalone_app_dir/.next/static"
  cp -R ".next/static" "$standalone_app_dir/.next/static"
fi

if [ -d "public" ]; then
  rm -rf "$standalone_app_dir/public"
  mkdir -p "$standalone_app_dir/public"
  cp -R public/. "$standalone_app_dir/public/"
fi

export HOSTNAME="0.0.0.0"
export NODE_ENV="production"

exec node "$standalone_app_dir/server.js"
