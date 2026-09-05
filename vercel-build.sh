#!/bin/bash
# Vercel 构建脚本：
# 1. 构建前端
# 2. 初始化 Supabase 数据库（幂等；未配置 DATABASE_URL 时跳过，如本地/部分预览环境）
# 3. 生产环境冒烟测试（访问当前线上部署，验证 API/数据库可用性；失败不阻断构建）
set -e

echo "[build] 1/3 构建前端..."
cd web && npm install && npx vite build && cd ..

echo "[build] 2/3 初始化数据库（幂等）..."
if [ -n "$DATABASE_URL" ]; then
  (cd server && npm install && npx tsx src/scripts/initDb.ts)
else
  echo "[build] 未配置 DATABASE_URL，跳过数据库初始化"
fi

echo "[build] 3/3 冒烟测试（验证当前线上部署）..."
if [ "$VERCEL_ENV" = "production" ] && [ -n "$DATABASE_URL" ]; then
  SMOKE_URL="https://pm-tools-log.vercel.app"
  echo "[smoke] GET $SMOKE_URL/api/health"
  curl -sS --max-time 60 "$SMOKE_URL/api/health" || echo "[smoke] 健康检查失败（忽略）"
  echo ""
  echo "[smoke] POST $SMOKE_URL/api/auth/login (director1)"
  curl -sS --max-time 60 -X POST "$SMOKE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"director1","password":"123456"}' | head -c 500 || echo "[smoke] 登录测试失败（忽略）"
  echo ""
else
  echo "[build] 非生产环境或未配置数据库，跳过冒烟测试"
fi

echo "[build] 完成"
