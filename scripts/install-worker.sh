#!/usr/bin/env bash
set -euo pipefail
REPO_URL="${DEPLOYPILOT_REPO_URL:-https://github.com/porwalakshat124/deploypilot.git}"
VERSION="${DEPLOYPILOT_VERSION:-main}"
INSTALL_DIR="${DEPLOYPILOT_WORKER_DIR:-$HOME/.deploypilot-worker}"
CONFIG_PATH="${1:?Usage: install-worker.sh /path/to/private-worker.env}"
for command in git node pnpm docker; do command -v "$command" >/dev/null || { echo "$command is required"; exit 1; }; done
[ "$(docker info --format '{{.OSType}}')" = linux ] || { echo "Start a Linux Docker engine first"; exit 1; }
for key in WORKER_API_URL WORKER_ID WORKER_TOKEN; do grep -Eq "^$key=.+" "$CONFIG_PATH" || { echo "Missing $key"; exit 1; }; done
if grep -Eq '^(DATABASE_URL|DIRECT_URL|REDIS_URL|GITHUB_PRIVATE_KEY|OPENAI_API_KEY)=' "$CONFIG_PATH"; then echo "Worker config must not contain server credentials"; exit 1; fi
if [ -e "$INSTALL_DIR" ]; then echo "Use a new installation directory; existing files are preserved"; exit 1; fi
git clone --depth 1 --branch "$VERSION" "$REPO_URL" "$INSTALL_DIR"
sed '/^WORKER_VERSION=/d' "$CONFIG_PATH" > "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"
cd "$INSTALL_DIR"
pnpm install --filter @deploypilot/worker... --frozen-lockfile
pnpm --filter @deploypilot/worker build
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/deploypilot-worker.service" <<EOF
[Unit]
Description=DeployPilot outbound Docker worker
After=network-online.target
[Service]
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v node) $INSTALL_DIR/apps/worker/dist/main.js
Restart=always
RestartSec=10
[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now deploypilot-worker
echo "Installed. Enable user lingering if this worker must run after logout."
