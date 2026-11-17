#!/bin/bash
# Finish the Eventra API on the host. Idempotent. Does not touch other apps.
# Expects /tmp/eventra-release/{eventra-backend.jar,seed.json,eventra-api.service,eventra-jre.tgz}
exec > /tmp/eventra-finish.log 2>&1
set -euo pipefail
echo "start $(date)"

# Our earlier setup unit stalled on apt-get update. Stop only that unit.
if systemctl is-active --quiet eventra-setup 2>/dev/null; then
  systemctl stop eventra-setup || true
  sleep 1
  systemctl kill eventra-setup 2>/dev/null || true
  echo "stopped stalled setup unit"
fi

SRC=/tmp/eventra-release
install -d -m 0755 /opt/eventra
id eventra >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin eventra

if [ ! -x /opt/eventra/jre/bin/java ]; then
  mkdir -p /opt/eventra/jre
  tar xzf "$SRC/eventra-jre.tgz" -C /opt/eventra/jre --strip-components=1
fi
/opt/eventra/jre/bin/java -version
echo "java-ok"

install -m 0644 "$SRC/eventra-backend.jar" /opt/eventra/eventra-backend.jar
install -m 0644 "$SRC/seed.json" /opt/eventra/seed.json
install -m 0644 "$SRC/eventra-api.service" /etc/systemd/system/eventra-api.service

mkdir -p /etc/eventra
if [ ! -f /etc/eventra/eventra.env ]; then
  PW=$(openssl rand -hex 18)
  umask 077
  cat > /etc/eventra/eventra.env <<EOF
PORT=8796
HOST=127.0.0.1
DB_URL=jdbc:mysql://127.0.0.1:3306/eventra?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USER=eventra
DB_PASSWORD=${PW}
SEED_FILE=/opt/eventra/seed.json
CORS_ORIGINS=
EOF
  echo "env-written"
else
  echo "env-exists"
fi
chown root:eventra /etc/eventra /etc/eventra/eventra.env
chmod 750 /etc/eventra
chmod 640 /etc/eventra/eventra.env
PW=$(grep '^DB_PASSWORD=' /etc/eventra/eventra.env | cut -d= -f2-)

# MySQL: prefer a private container so we do not apt-install on a loaded box.
if ! ss -ltn | grep -q ':3306 '; then
  if ! command -v docker >/dev/null; then
    echo "no-mysql-and-no-docker"
    exit 1
  fi
  docker rm -f eventra-mysql >/dev/null 2>&1 || true
  docker run -d --name eventra-mysql --restart unless-stopped \
    --memory 384m \
    -p 127.0.0.1:3306:3306 \
    -e MYSQL_ROOT_PASSWORD="$(openssl rand -hex 18)" \
    -e MYSQL_DATABASE=eventra \
    -e MYSQL_USER=eventra \
    -e MYSQL_PASSWORD="$PW" \
    -v eventra-mysql-data:/var/lib/mysql \
    mysql:8.4 \
    --mysqlx=OFF --performance-schema=OFF --innodb-buffer-pool-size=64M --max-connections=40
  echo "mysql-container-started"
else
  echo "mysql-port-already-up"
fi

ready=0
for i in $(seq 1 60); do
  if docker exec eventra-mysql mysql -ueventra -p"$PW" -e "SELECT 1" eventra >/dev/null 2>&1; then
    echo "mysql-ready ${i}"
    ready=1
    break
  fi
  if command -v mysqladmin >/dev/null && mysqladmin ping -h 127.0.0.1 -ueventra -p"$PW" --silent >/dev/null 2>&1; then
    echo "mysql-ready-host ${i}"
    ready=1
    break
  fi
  sleep 5
done
if [ "$ready" != 1 ]; then
  echo "mysql-not-ready"
  docker logs eventra-mysql 2>&1 | tail -20
  exit 1
fi

systemctl daemon-reload
systemctl enable eventra-api.service
systemctl restart eventra-api.service

api=0
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:8796/api/health >/dev/null 2>&1; then
    echo "api-healthy ${i}"
    api=1
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:8796/api/health || true
echo
if [ "$api" != 1 ]; then
  journalctl -u eventra-api --no-pager -n 30
  exit 1
fi

MARK="eventra-api.187.127.137.136.sslip.io"
if ! grep -q "$MARK" /etc/caddy/Caddyfile; then
  mkdir -p /root/backups
  cp /etc/caddy/Caddyfile "/root/backups/Caddyfile-before-eventra-$(date +%Y%m%d%H%M%S)"
  cat >> /etc/caddy/Caddyfile <<EOF

${MARK} {
	encode gzip
	reverse_proxy 127.0.0.1:8796
}
EOF
  if ! caddy validate --config /etc/caddy/Caddyfile; then
    echo "caddy-validate-failed"
    exit 1
  fi
  systemctl reload caddy
  echo "caddy-reloaded"
else
  echo "caddy-vhost-exists"
fi

sleep 2
curl -fsS "https://${MARK}/api/health" || curl -fsS "http://${MARK}/api/health" || echo "public-health-not-yet"
echo
echo "done $(date)"
rm -rf /tmp/eventra-release /tmp/eventra-release.tgz
