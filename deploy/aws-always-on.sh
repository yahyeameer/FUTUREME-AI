#!/bin/bash
# TOMORA on your own server, always on, with a free HTTPS link.
# Works on AWS EC2 and any Ubuntu 22.04/24.04 VM (Nebius, DigitalOcean, Hetzner, a home server...).
#   AWS / most clouds: paste this whole file into "User data" (cloud-init) when you create the VM.
#   Any other Ubuntu box: copy it over and run   sudo bash aws-user-data-always-on.sh
# Fill in the settings below first. Setup log on the server: /var/log/futureme-setup.log
#
# ---------- settings ----------
NEBIUS_API_KEY=""                         # your Nebius Token Factory key (empty = stand-in model)
ACCESS_CODE="change-me-123"               # code people type to open the app (FUTUREME_ACCESS_CODE)
DOMAIN=""                                 # optional, e.g. futureme.duckdns.org. Empty = <ip>.sslip.io
MODEL_MODE="nebius"                       # "nebius" = Nemotron on Nebius Token Factory (small VM is fine)
                                          # "local"  = the model runs on this VM itself, nothing leaves it
LOCAL_MODEL="ai/nemotron-3-nano:4b-q4_K_M" # local mode only. Needs ~8 GB RAM. Smaller: ai/llama3.2:1B-Q4_0
REPO="https://github.com/yahyeameer/FUTUREME-AI.git" # or your own fork
# ------------------------------
set -eux
exec > /var/log/futureme-setup.log 2>&1

# 1. Swap, so the Next.js build doesn't run out of memory on a 1-2 GB instance.
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. Docker (starts on every boot by itself).
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
id ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu
usermod -aG docker ubuntu

# 3. The app.
APP=/home/ubuntu/futureme-ai
[ -d "$APP" ] || git clone -b main "$REPO" "$APP"
cd "$APP"
if [ ! -f .env ]; then
  cat > .env <<ENV
NEBIUS_API_KEY=$NEBIUS_API_KEY
NEBIUS_BASE_URL=https://api.tokenfactory.us-north1.nebius.com/v1/
NEBIUS_MODEL=nvidia/Nemotron-3.5-Super-VL
SEED_DEMO=1
FUTUREME_ACCESS_CODE=$ACCESS_CODE
SITE=
TWIN_PUBLIC_URL=
ENV
fi
chmod 600 .env
echo "$DOMAIN" > /etc/futureme-domain

# Local model: Docker Model Runner serves the model on this VM, and the repo's docker-compose.local.yml
# points every agent at it. COMPOSE_FILE in .env makes plain "docker compose ..." use these files.
if [ "$MODEL_MODE" = "local" ]; then
  apt-get install -y docker-model-plugin
  printf 'models:\n  llm:\n    model: %s\n' "$LOCAL_MODEL" > docker-compose.localmodel.yml
  grep -q '^COMPOSE_FILE=' .env || \
    echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml:docker-compose.localmodel.yml:docker-compose.override.yml' >> .env
  docker model pull "$LOCAL_MODEL"
fi

# Extra services next to the repo's docker-compose.yml: pass all of .env into the app, and put Caddy
# (automatic free HTTPS certificate) in front on ports 80/443. Both restart by themselves if they crash.
cat > docker-compose.override.yml <<'YML'
services:
  futureme:
    env_file: .env
    ports: !override ["127.0.0.1:3000:3000"]
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    command: caddy reverse-proxy --from ${SITE} --to futureme:3000
    volumes: ["caddy-data:/data"]
    depends_on: [futureme]
volumes:
  caddy-data:
YML
chown -R ubuntu:ubuntu "$APP"

# 4. A boot service: on every start it looks up the current public IP, picks the HTTPS name and starts everything.
cat > /usr/local/bin/futureme-start <<'SH'
#!/bin/bash
set -e
cd /home/ubuntu/futureme-ai
SITE=$(cat /etc/futureme-domain 2>/dev/null || true)
if [ -z "$SITE" ]; then
  TOKEN=$(curl -s --max-time 3 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)
  IP=$(curl -s --max-time 3 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
  # Not on AWS: ask a public service which address this VM is reached on.
  [[ "$IP" =~ ^[0-9.]+$ ]] || IP=$(curl -s https://api.ipify.org)
  SITE="${IP//./-}.sslip.io"
fi
sed -i -e "s|^SITE=.*|SITE=$SITE|" -e "s|^TWIN_PUBLIC_URL=.*|TWIN_PUBLIC_URL=https://$SITE|" .env
echo "https://$SITE" > /home/ubuntu/futureme-url.txt
docker compose up -d --build
SH
chmod +x /usr/local/bin/futureme-start

cat > /etc/systemd/system/futureme.service <<'UNIT'
[Unit]
Description=TOMORA (app + HTTPS)
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/futureme-start
TimeoutStartSec=1800

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable futureme.service
systemctl start futureme.service
echo "DONE: $(cat /home/ubuntu/futureme-url.txt)"
