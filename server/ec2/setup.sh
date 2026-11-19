#!/usr/bin/env bash
# One-time provisioning of the EC2 box (Amazon Linux 2023, arm64). Idempotent.
# Run by scripts/deploy-server.sh as root: installs Node 24, Caddy (automatic
# HTTPS for <ip>.sslip.io) and the systemd units. Usage: setup.sh <hostname>
set -euo pipefail

HOST="$1"
APP=/opt/betta

# Node 24 from nodejs.org (the distro packages lag behind).
if ! /usr/local/bin/node --version 2>/dev/null | grep -q '^v24\.'; then
  TARBALL=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt | grep -o 'node-v24[^ ]*-linux-arm64\.tar\.xz' | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$TARBALL" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm /tmp/node.tar.xz
fi

# Caddy single binary.
if ! command -v caddy >/dev/null; then
  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=arm64" -o /usr/local/bin/caddy
  chmod +x /usr/local/bin/caddy
  useradd --system --home /var/lib/caddy --create-home --shell /sbin/nologin caddy || true
fi

mkdir -p "$APP" /etc/caddy
chown -R ec2-user:ec2-user "$APP"
touch /etc/betta.env && chmod 600 /etc/betta.env

cat > /etc/caddy/Caddyfile <<EOF
$HOST {
	reverse_proxy localhost:4000
}
EOF

cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/betta.service <<EOF
[Unit]
Description=betta session server
After=network-online.target

[Service]
User=ec2-user
WorkingDirectory=$APP
EnvironmentFile=/etc/betta.env
ExecStart=/usr/local/bin/node server/index.ts
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable caddy betta >/dev/null 2>&1
systemctl restart caddy
echo "node $(/usr/local/bin/node --version), caddy $(/usr/local/bin/caddy version | cut -d' ' -f1)"
