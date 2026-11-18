#!/bin/bash
# Install or update the Eventra API on the host. Run as root after setup-host.sh.
# Expects /tmp/eventra-release/{eventra-backend.jar,eventra-api.service}.
exec > /tmp/eventra-install.log 2>&1
set -euo pipefail
SRC=/tmp/eventra-release

id eventra >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin eventra
install -m 0644 "$SRC/eventra-backend.jar" /opt/eventra/eventra-backend.jar
install -m 0644 "$SRC/eventra-api.service" /etc/systemd/system/eventra-api.service
chown root:eventra /etc/eventra /etc/eventra/eventra.env
chmod 750 /etc/eventra
chmod 640 /etc/eventra/eventra.env

systemctl daemon-reload
systemctl enable eventra-api.service
systemctl restart eventra-api.service

for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8796/api/health >/dev/null 2>&1; then echo "healthy after ${i}s"; break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8796/api/health
echo
journalctl -u eventra-api --no-pager -n 5
rm -rf "$SRC"
echo "installed $(date)"
