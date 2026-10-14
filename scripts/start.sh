#!/bin/sh
# Container entrypoint: runs Docker Agent (the future-self agent) and the web app side by side.
# Without NEBIUS_API_KEY (or with LLM_PROVIDER=mock) both use the built-in stand-in model, so the demo always runs.
set -e

FLAVOR=""
if [ "$LLM_PROVIDER" = "mock" ] || [ -z "$NEBIUS_API_KEY" ]; then
  echo "No NEBIUS_API_KEY: using the stand-in model."
  export LLM_PROVIDER=mock NEBIUS_API_KEY="${NEBIUS_API_KEY:-unused}"
  node_modules/.bin/tsx scripts/mock-model-server.ts &
  FLAVOR="--flavor mock"
fi

mkdir -p "$(dirname "$DATABASE_PATH")" "$VAULT_DIR"
[ "$SEED_DEMO" = "1" ] && node_modules/.bin/tsx scripts/seed-demo.ts --if-empty

# Use NEBIUS_MODEL for the agent too, so the app and the agent run the same Nemotron model.
AGENT_FILE=agents/futureme.yaml
if [ -n "$NEBIUS_MODEL" ] && [ -z "$FLAVOR" ]; then
  AGENT_FILE=agents/futureme.runtime.yaml
  sed "s|^    model: .* \# NEBIUS_MODEL.*|    model: $NEBIUS_MODEL|" agents/futureme.yaml > "$AGENT_FILE"
fi
docker-agent serve chat "$AGENT_FILE" --safety autonomous --listen 127.0.0.1:8083 --working-dir "$(pwd)" $FLAVOR &
export DOCKER_AGENT_URL=http://127.0.0.1:8083

exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
