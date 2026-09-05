#!/bin/bash
# 日志管理系统 - 一键启动脚本
# 用法: ./start.sh [dev|build]

set -e
cd "$(dirname "$0")"

MODE=${1:-dev}

echo "=========================================="
echo "  日志管理系统启动脚本 (模式: $MODE)"
echo "=========================================="

# 1. 检查并启动 PostgreSQL
if ! pg_isready -q 2>/dev/null; then
  echo "[1/4] 启动 PostgreSQL..."
  service postgresql start || pg_ctlcluster 16 main start
  sleep 2
else
  echo "[1/4] PostgreSQL 已在运行"
fi

# 2. 初始化数据库（幂等）
if ! su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE dbname='logdb'\"" | grep -q 1; then
  echo "[2/4] 创建数据库..."
  su - postgres -c "psql -c \"CREATE USER logadmin WITH PASSWORD 'logadmin123' SUPERUSER;\"" 2>/dev/null || true
  su - postgres -c "psql -c 'CREATE DATABASE logdb OWNER logadmin;'"
else
  echo "[2/4] 数据库已存在"
fi

# 3. 启动后端
echo "[3/4] 启动后端服务..."
if [ "$MODE" = "dev" ]; then
  cd server && npm run dev > /tmp/log-server.log 2>&1 &
else
  cd server && npm run build && (node dist/index.js > /tmp/log-server.log 2>&1 &)
fi
cd ..
echo "  后端日志: /tmp/log-server.log"

# 4. 启动前端
echo "[4/4] 启动前端服务..."
if [ "$MODE" = "dev" ]; then
  cd web && npm run dev > /tmp/log-web.log 2>&1 &
else
  cd web && npm run build && (npx vite preview --port 5173 > /tmp/log-web.log 2>&1 &)
fi
cd ..

sleep 3
echo ""
echo "=========================================="
echo "  启动完成！"
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3000"
echo "  首个注册用户将自动成为项目总监"
echo "=========================================="
