#!/bin/sh
# Container entrypoint: runs Docker Agent (FutureMe's agent team), the night-shift scheduler and the web app side by side.
#   LLM_PROVIDER=local   every agent runs on Docker Model Runner on this machine (see docker-compose.local.yml)
#   no NEBIUS_API_KEY    (or LLM_PROVIDER=mock) both use the built-in stand-in model, so the demo always runs
set -e

FLAVOR=""
AGENT_FILE=agents/futureme.yaml
if [ "$LLM_PROVIDER" = "local" ]; then
  export LOCAL_LLM_URL="${LOCAL_LLM_URL:-http://model-runner.docker.internal/engines/v1}" LOCAL_MODEL="${LOCAL_MODEL:-ai/qwen3}"
  export NEBIUS_API_KEY="${NEBIUS_API_KEY:-unused-in-local-mode}"
  echo "Local mode: every agent uses $LOCAL_MODEL at $LOCAL_LLM_URL. Nothing is sent to a cloud model."
  # Point the team's provider at Docker Model Runner's OpenAI-compatible endpoint.
  AGENT_FILE=agents/futureme.runtime.yaml
  sed -e "s|^    base_url: https://api.tokenfactory.nebius.com/v1/|    base_url: ${LOCAL_LLM_URL%/}/|" \
      -e "s|^    model: .* \# NEBIUS_MODEL.*|    model: $LOCAL_MODEL|" agents/futureme.yaml > "$AGENT_FILE"
elif [ "$LLM_PROVIDER" = "mock" ] || [ -z "$NEBIUS_API_KEY" ]; then
  echo "No NEBIUS_API_KEY: using the stand-in model."
  export LLM_PROVIDER=mock NEBIUS_API_KEY="${NEBIUS_API_KEY:-unused}"
  node_modules/.bin/tsx scripts/mock-model-server.ts &
  FLAVOR="--flavor mock"
elif [ -n "$NEBIUS_MODEL" ]; then
  # Use NEBIUS_MODEL for the agents too, so the app and the agents run the same Nemotron model.
  AGENT_FILE=agents/futureme.runtime.yaml
  sed "s|^    model: .* \# NEBIUS_MODEL.*|    model: $NEBIUS_MODEL|" agents/futureme.yaml > "$AGENT_FILE"
fi

mkdir -p "$(dirname "$DATABASE_PATH")" "$VAULT_DIR"
[ "$SEED_DEMO" = "1" ] && node_modules/.bin/tsx scripts/seed-demo.ts --if-empty

docker-agent serve chat "$AGENT_FILE" --safety autonomous --listen 127.0.0.1:8083 --working-dir "$(pwd)" $FLAVOR &
export DOCKER_AGENT_URL=http://127.0.0.1:8083

# The night shift publishes the Daily and a morning brief at NIGHT_SHIFT_AT (default 05:30). NIGHT_SHIFT_AT=off disables it.
if [ "$NIGHT_SHIFT_AT" != "off" ]; then
  node_modules/.bin/tsx scripts/night-shift.ts --loop &
  export NIGHT_SHIFT_SCHEDULER=on
fi

exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
