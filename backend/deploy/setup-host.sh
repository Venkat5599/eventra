#!/bin/bash
# Eventra backend: one-time host setup (MySQL server + Java 21 runtime). Idempotent.
exec > /tmp/eventra-setup.log 2>&1
set -euo pipefail
echo "start $(date)"

mkdir -p /opt/eventra /etc/eventra
chmod 700 /etc/eventra

# --- MySQL 8 (Ubuntu package), local-only, small memory footprint
if ! command -v mysqld >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y -q --no-install-recommends mysql-server
fi
cat > /etc/mysql/mysql.conf.d/zz-eventra.cnf <<'EOF'
[mysqld]
bind-address = 127.0.0.1
mysqlx = OFF
performance_schema = OFF
innodb_buffer_pool_size = 64M
max_connections = 40
EOF
systemctl enable mysql
systemctl restart mysql
sleep 3
systemctl is-active mysql

# --- database + user (password generated here, kept only in /etc/eventra/eventra.env)
if [ ! -f /etc/eventra/eventra.env ]; then
  PW=$(openssl rand -hex 18)
  mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS eventra CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'eventra'@'localhost' IDENTIFIED BY '${PW}';
ALTER USER 'eventra'@'localhost' IDENTIFIED BY '${PW}';
GRANT ALL PRIVILEGES ON eventra.* TO 'eventra'@'localhost';
FLUSH PRIVILEGES;
SQL
  umask 077
  cat > /etc/eventra/eventra.env <<EOF
PORT=8796
DB_URL=jdbc:mysql://127.0.0.1:3306/eventra?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USER=eventra
DB_PASSWORD=${PW}
CORS_ORIGINS=http://localhost:4611,http://127.0.0.1:4611,http://localhost:5180
EOF
fi

# --- Java 21 runtime (Temurin JRE tarball, private to /opt/eventra)
if [ ! -x /opt/eventra/jre/bin/java ]; then
  curl -sSfL -o /tmp/eventra-jre.tgz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse"
  mkdir -p /opt/eventra/jre
  tar xzf /tmp/eventra-jre.tgz -C /opt/eventra/jre --strip-components=1
  rm -f /tmp/eventra-jre.tgz
fi
/opt/eventra/jre/bin/java -version
echo "done $(date)"
