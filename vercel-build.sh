#!/bin/bash
# Vercel 构建脚本：
# 1. 构建前端
# 2. 初始化 Supabase 数据库（幂等；未配置 DATABASE_URL 时跳过，如本地/部分预览环境）
# 3. 生产环境冒烟测试（访问当前线上部署，验证 API/数据库可用性；失败不阻断构建）
set -e
set +H  # 禁用历史扩展，避免密码中的 ! 被误解析

echo "[build] 1/3 构建前端..."
(cd web && npm install && npx vite build) || exit 1

echo "[build] 2/3 初始化数据库（幂等）..."
if [ -n "$DATABASE_URL" ]; then
  (cd server && npm install && npx tsx src/scripts/initDb.ts) || exit 1
else
  echo "[build] 未配置 DATABASE_URL，跳过数据库初始化"
fi

echo "[build] 3/3 冒烟测试（验证当前线上部署）..."
if [ "$VERCEL_ENV" = "production" ]; then
  if [ -n "$DATABASE_URL" ]; then
    echo "[smoke] DATABASE_URL 已配置（本构建已执行数据库初始化）"
  else
    echo "[smoke] DATABASE_URL 未配置！本构建跳过了数据库初始化"
  fi
  SMOKE_URL="https://pm-tools-log.vercel.app"
  echo "[smoke] GET $SMOKE_URL/ (前端 HTML)"
  curl -sS --max-time 60 "$SMOKE_URL/" | head -c 300 || echo "[smoke] 前端页面获取失败（忽略）"
  echo ""
  echo "[smoke] GET $SMOKE_URL/api/health"
  curl -sS --max-time 60 "$SMOKE_URL/api/health" || echo "[smoke] 健康检查失败（忽略）"
  echo ""
  echo "[smoke] POST $SMOKE_URL/api/auth/login (director1)"
  SMOKE_BODY=$(cat <<'JSON'
{"username":"director1","password":"PmLog@2026!Secure"}
JSON
)
  SMOKE_LOGIN=$(curl -sS --max-time 60 -X POST "$SMOKE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$SMOKE_BODY") || SMOKE_LOGIN=""
  echo "$SMOKE_LOGIN" | head -c 500
  echo ""
  TOKEN=$(echo "$SMOKE_LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  if [ -z "$TOKEN" ]; then
    echo "[smoke] 登录未取得 token，跳过接口校验"
  else
    # 冒烟校验新增表与新接口（仅记录结果，不阻断构建）
    smoke_api() {
      local name="$1" path="$2"
      local body
      body=$(curl -sS --max-time 60 -H "Authorization: Bearer $TOKEN" "$SMOKE_URL$path") || true
      if echo "$body" | grep -q '"code":0'; then
        echo "[smoke] PASS $name"
      else
        echo "[smoke] FAIL $name => $(echo "$body" | head -c 200)"
      fi
    }

    echo "[smoke] 校验新增功能接口（对应 4 张新表）..."
    smoke_api "GET /api/auth/me（邮箱字段）" "/api/auth/me"
    smoke_api "GET /api/versions（app_versions 表）" "/api/versions"
    smoke_api "GET /api/notifications（notifications 表）" "/api/notifications"
    smoke_api "GET /api/feedback/mine（feedback 表）" "/api/feedback/mine"
    smoke_api "GET /api/approvals/mine（edit_approvals 表）" "/api/approvals/mine"
    echo "[smoke] 新增功能接口校验完成"
  fi
else
  echo "[build] 非生产环境，跳过冒烟测试"
fi

echo "[build] 完成"
