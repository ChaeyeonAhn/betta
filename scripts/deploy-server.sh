#!/usr/bin/env bash
# `pnpm deploy:server`: push server/ + lib/ to the EC2 box and restart it.
# Goes through AWS Systems Manager (SSM Run Command), so the box has no SSH
# port open. Every run also re-applies server/ec2/setup.sh (idempotent).
#
# Needs: the AWS CLI logged in (`aws login --profile betta --region ap-northeast-2`)
# and ADMIN_KEY in .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."

INSTANCE="${BETTA_EC2_INSTANCE:-i-07d21b50705c3e68d}"
IP="${BETTA_EC2_IP:-3.37.110.43}"
HOST="${IP//./-}.sslip.io"
ORIGINS="${ALLOWED_ORIGINS:-https://betta-sigma.vercel.app}"
export AWS_PROFILE="${AWS_PROFILE:-betta}" AWS_REGION="${AWS_REGION:-ap-northeast-2}"

ADMIN_KEY=$(grep '^ADMIN_KEY=' .env.local | cut -d= -f2-)
[ -n "$ADMIN_KEY" ] || { echo "ADMIN_KEY missing in .env.local"; exit 1; }

# Runs a bash script on the box as root and prints its output.
remote() {
  local script="$1" params id status
  params=$(python3 -c 'import json,sys; print(json.dumps({"commands": [sys.stdin.read()]}))' <<<"$script")
  id=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
    --parameters "$params" --query Command.CommandId --output text)
  while true; do
    sleep 2
    status=$(aws ssm get-command-invocation --command-id "$id" --instance-id "$INSTANCE" \
      --query Status --output text 2>/dev/null || echo Pending)
    case "$status" in Pending | InProgress | Delayed) ;; *) break ;; esac
  done
  aws ssm get-command-invocation --command-id "$id" --instance-id "$INSTANCE" \
    --query '[StandardOutputContent,StandardErrorContent]' --output text
  [ "$status" = "Success" ] || { echo "remote step failed: $status"; exit 1; }
}

# The server only needs socket.io; pin the version the lockfile resolved.
SOCKET_IO=$(node -p 'require("./node_modules/socket.io/package.json").version')
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/app"
cp -R lib server "$STAGE/app/"
cat >"$STAGE/app/package.json" <<EOF
{ "private": true, "type": "module", "dependencies": { "socket.io": "$SOCKET_IO" } }
EOF
APP_TGZ=$(COPYFILE_DISABLE=1 tar --no-xattrs -C "$STAGE/app" -czf - . | base64)
SETUP=$(base64 <server/ec2/setup.sh)

echo "→ provision + upload + restart"
remote "set -euo pipefail
echo '$SETUP' | base64 -d > /tmp/betta-setup.sh
bash /tmp/betta-setup.sh '$HOST'
rm -rf /opt/betta/lib /opt/betta/server
echo '$APP_TGZ' | base64 -d | tar -xzf - -C /opt/betta
chown -R ec2-user:ec2-user /opt/betta
printf 'PORT=4000\nADMIN_KEY=%s\nALLOWED_ORIGINS=%s\n' '$ADMIN_KEY' '$ORIGINS' > /etc/betta.env
cd /opt/betta && sudo -u ec2-user env PATH=/usr/local/bin:\$PATH npm install --omit=dev --no-audit --no-fund --silent
systemctl restart betta
sleep 1
echo \"betta: \$(systemctl is-active betta)\""

echo "✓ https://$HOST"
