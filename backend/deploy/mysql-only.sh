#!/bin/bash
# Install MySQL 8 for Eventra. Localhost only. Idempotent.
exec > /tmp/eventra-mysql.log 2>&1
set -euo pipefail
echo "start $(date)"
export DEBIAN_FRONTEND=noninteractive
if ! command -v mysqld >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends mysql-server
fi
mkdir -p /etc/mysql/mysql.conf.d
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
for i in $(seq 1 40); do
  mysqladmin ping --silent && break
  sleep 2
done
mkdir -p /etc/eventra
chmod 700 /etc/eventra
if [ ! -f /etc/eventra/eventra.env ]; then
  PW=$(openssl rand -hex 12)
  mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS eventra CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'eventra'@'localhost' IDENTIFIED BY '${PW}';
ALTER USER 'eventra'@'localhost' IDENTIFIED BY '${PW}';
GRANT ALL PRIVILEGES ON eventra.* TO 'eventra'@'localhost';
FLUSH PRIVILEGES;
SQL
  umask 077
  cat > /etc/eventra/eventra.env <<EOF
DB_URL=jdbc:mysql://127.0.0.1:3306/eventra?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USER=eventra
DB_PASSWORD=${PW}
EOF
fi
mysql -uroot -e "SHOW DATABASES LIKE 'eventra';"
echo "ready $(date)"
