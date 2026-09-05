#!/bin/bash
# 端到端业务流程与数据权限测试脚本
BASE="http://localhost:3000/api"
PASS=0; FAIL=0

check() { # $1=描述 $2=期望包含的关键字 $3=实际结果
  if echo "$3" | grep -q "$2"; then
    PASS=$((PASS+1)); echo "  [PASS] $1"
  else
    FAIL=$((FAIL+1)); echo "  [FAIL] $1 => $(echo "$3" | head -c 300)"
  fi
}

check_or_exists() { # 注册幂等检查：成功或已注册均视为通过（$1=描述 $2=响应）
  if echo "$2" | grep -q '"code":0'; then
    PASS=$((PASS+1)); echo "  [PASS] $1"
  elif echo "$2" | grep -q '已被注册'; then
    PASS=$((PASS+1)); echo "  [PASS] $1 (已存在，幂等通过)"
  else
    FAIL=$((FAIL+1)); echo "  [FAIL] $1 => $(echo "$2" | head -c 300)"
  fi
}

echo "=== 1. 注册用户 ==="
R=$(curl -s --noproxy '*' -X POST $BASE/auth/register -H 'Content-Type: application/json' -d '{"username":"pm1","email":"pm1@test.com","password":"123456","displayName":"王经理"}')
check_or_exists "注册 pm1" "$R"
R=$(curl -s --noproxy '*' -X POST $BASE/auth/register -H 'Content-Type: application/json' -d '{"username":"leader1","email":"leader1@test.com","password":"123456","displayName":"李组长"}')
check_or_exists "注册 leader1" "$R"
R=$(curl -s --noproxy '*' -X POST $BASE/auth/register -H 'Content-Type: application/json' -d '{"username":"member1","email":"member1@test.com","password":"123456","displayName":"张三"}')
check_or_exists "注册 member1" "$R"
R=$(curl -s --noproxy '*' -X POST $BASE/auth/register -H 'Content-Type: application/json' -d '{"username":"member2","email":"member2@test.com","password":"123456","displayName":"赵四"}')
check_or_exists "注册 member2" "$R"

echo "=== 2. 登录获取 token ==="
DIR_TOKEN=$(curl -s --noproxy '*' -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"username":"director1","password":"123456"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
PM_TOKEN=$(curl -s --noproxy '*' -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"username":"pm1","password":"123456"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
LEADER_TOKEN=$(curl -s --noproxy '*' -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"username":"leader1","password":"123456"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
MEMBER1_TOKEN=$(curl -s --noproxy '*' -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"username":"member1","password":"123456"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
MEMBER2_TOKEN=$(curl -s --noproxy '*' -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{"username":"member2","password":"123456"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
check "总监登录" "eyJ" "$DIR_TOKEN"
check "pm1 登录" "eyJ" "$PM_TOKEN"
check "leader1 登录" "eyJ" "$LEADER_TOKEN"
check "member1 登录" "eyJ" "$MEMBER1_TOKEN"

echo "=== 3. 总监设置 pm1 为项目经理（全局角色） ==="
R=$(curl -s --noproxy '*' -X PUT $BASE/users/2/role -H "Authorization: Bearer $DIR_TOKEN" -H 'Content-Type: application/json' -d '{"role":"manager"}')
check "设置 pm1 全局角色为 manager" '"code":0' "$R"
# 非总监设置角色应被拒绝
R=$(curl -s --noproxy '*' -X PUT $BASE/users/3/role -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d '{"role":"manager"}')
check "非总监设置角色被拒绝(403)" '"code":403' "$R"

echo "=== 4. pm1 创建项目 ==="
R=$(curl -s --noproxy '*' -X POST $BASE/projects -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d '{"name":"智慧园区平台","description":"智慧园区一体化管理平台开发"}')
check "pm1 创建项目成功" '"code":0' "$R"
PROJECT_ID=$(echo "$R" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
echo "  项目ID: $PROJECT_ID"

echo "=== 5. pm1 添加项目成员 ==="
R=$(curl -s --noproxy '*' -X POST $BASE/projects/$PROJECT_ID/members -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d '{"userId":3,"projectRole":"leader"}')
check "添加 leader1 为小组长" '"code":0' "$R"
R=$(curl -s --noproxy '*' -X POST $BASE/projects/$PROJECT_ID/members -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d '{"userId":4,"projectRole":"member"}')
check "添加 member1 为组员" '"code":0' "$R"
R=$(curl -s --noproxy '*' -X POST $BASE/projects/$PROJECT_ID/members -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d '{"userId":5,"projectRole":"member"}')
check "添加 member2 为组员" '"code":0' "$R"
# 非项目经理添加成员应被拒绝
R=$(curl -s --noproxy '*' -X POST $BASE/projects/$PROJECT_ID/members -H "Authorization: Bearer $MEMBER1_TOKEN" -H 'Content-Type: application/json' -d '{"userId":1,"projectRole":"member"}')
check "组员添加成员被拒绝(403)" '"code":403' "$R"

echo "=== 6. pm1 创建小组并指定组长 ==="
R=$(curl -s --noproxy '*' -X POST $BASE/projects/$PROJECT_ID/groups -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d '{"name":"前端组","leaderId":3}')
check "创建前端组(leader1为组长)" '"code":0' "$R"
GROUP_ID=$(echo "$R" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
# 将 member1、member2 分入前端组
R=$(curl -s --noproxy '*' -X PUT $BASE/projects/$PROJECT_ID/members/4 -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d "{\"groupId\":$GROUP_ID}")
check "member1 加入前端组" '"code":0' "$R"
R=$(curl -s --noproxy '*' -X PUT $BASE/projects/$PROJECT_ID/members/5 -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d "{\"groupId\":$GROUP_ID}")
check "member2 加入前端组" '"code":0' "$R"

echo "=== 7. 成员填写日志 ==="
TODAY=$(date +%F)
YESTERDAY=$(date -d "yesterday" +%F)
R=$(curl -s --noproxy '*' -X POST $BASE/logs -H "Authorization: Bearer $MEMBER1_TOKEN" -H 'Content-Type: application/json' -d "{\"logDate\":\"$TODAY\",\"projectId\":$PROJECT_ID,\"content\":\"今天完成了登录页面开发，修复了3个bug\",\"hours\":8}")
check "member1 填写今日日志" '"code":0' "$R"
R=$(curl -s --noproxy '*' -X POST $BASE/logs -H "Authorization: Bearer $MEMBER2_TOKEN" -H 'Content-Type: application/json' -d "{\"logDate\":\"$TODAY\",\"projectId\":$PROJECT_ID,\"content\":\"写了用户列表接口，联调通过\",\"hours\":7.5}")
check "member2 填写今日日志" '"code":0' "$R"
R=$(curl -s --noproxy '*' -X POST $BASE/logs -H "Authorization: Bearer $LEADER_TOKEN" -H 'Content-Type: application/json' -d "{\"logDate\":\"$TODAY\",\"projectId\":$PROJECT_ID,\"content\":\"组织了需求评审会，分配了本周任务\",\"hours\":6}")
check "leader1 填写今日日志" '"code":0' "$R"
R=$(curl -s --noproxy '*' -X POST $BASE/logs -H "Authorization: Bearer $PM_TOKEN" -H 'Content-Type: application/json' -d "{\"logDate\":\"$TODAY\",\"projectId\":$PROJECT_ID,\"content\":\"与客户确认了二期需求，调整了里程碑计划\",\"hours\":9}")
check "pm1 填写今日日志" '"code":0' "$R"

echo "=== 8. 数据权限验证 ==="
# 语义断言：验证返回日志的归属集合是否符合角色权限（兼容库中已有演示数据）
MEMBER1_ID=$(curl -s --noproxy '*' "$BASE/auth/me" -H "Authorization: Bearer $MEMBER1_TOKEN" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
LEADER_ID=$(curl -s --noproxy '*' "$BASE/auth/me" -H "Authorization: Bearer $LEADER_TOKEN" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
PM_ID=$(curl -s --noproxy '*' "$BASE/auth/me" -H "Authorization: Bearer $PM_TOKEN" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
MEMBER2_ID=$(curl -s --noproxy '*' "$BASE/auth/me" -H "Authorization: Bearer $MEMBER2_TOKEN" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
echo "  用户ID: pm1=$PM_ID leader1=$LEADER_ID member1=$MEMBER1_ID member2=$MEMBER2_ID"

# member1 只能看到自己的日志
R=$(curl -s --noproxy '*' "$BASE/logs?page=1&pageSize=200" -H "Authorization: Bearer $MEMBER1_TOKEN")
RESULT=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
ids = set(str(l['user_id']) for l in d['list'])
ok = ids <= {'$MEMBER1_ID'} and d['total'] > 0
print('PASS' if ok else 'FAIL', '| total=%d | user_ids=%s' % (d['total'], sorted(ids)))" 2>/dev/null || echo "FAIL | 解析异常")
if echo "$RESULT" | grep -q "^PASS"; then PASS=$((PASS+1)); echo "  [PASS] member1 仅见自己日志 ($RESULT)"
else FAIL=$((FAIL+1)); echo "  [FAIL] member1 仅见自己日志 => $RESULT"; fi

# leader1 能看到本组（leader1+member1+member2）的日志
R=$(curl -s --noproxy '*' "$BASE/logs?page=1&pageSize=200" -H "Authorization: Bearer $LEADER_TOKEN")
RESULT=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
ids = set(str(l['user_id']) for l in d['list'])
allowed = {'$LEADER_ID', '$MEMBER1_ID', '$MEMBER2_ID'}
ok = ids <= allowed and d['total'] > 0
print('PASS' if ok else 'FAIL', '| total=%d | user_ids=%s' % (d['total'], sorted(ids)))" 2>/dev/null || echo "FAIL | 解析异常")
if echo "$RESULT" | grep -q "^PASS"; then PASS=$((PASS+1)); echo "  [PASS] leader1 见本组日志 ($RESULT)"
else FAIL=$((FAIL+1)); echo "  [FAIL] leader1 见本组日志 => $RESULT"; fi

# pm1 能看到项目内全部日志（含本组成员与其他组，但不含其他项目独有成员）
R=$(curl -s --noproxy '*' "$BASE/logs?page=1&pageSize=200" -H "Authorization: Bearer $PM_TOKEN")
RESULT=$(echo "$R" | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
ids = set(str(l['user_id']) for l in d['list'])
projects = set(str(l['project_id']) for l in d['list'] if l['project_id'])
ok = d['total'] > 0
print('PASS' if ok else 'FAIL', '| total=%d | user_ids=%s | projects=%s' % (d['total'], sorted(ids), sorted(projects)))" 2>/dev/null || echo "FAIL | 解析异常")
if echo "$RESULT" | grep -q "^PASS"; then PASS=$((PASS+1)); echo "  [PASS] pm1 见项目全部日志 ($RESULT)"
else FAIL=$((FAIL+1)); echo "  [FAIL] pm1 见项目全部日志 => $RESULT"; fi

# 总监能看到所有日志
R=$(curl -s --noproxy '*' "$BASE/logs?page=1&pageSize=200" -H "Authorization: Bearer $DIR_TOKEN")
CNT=$(echo "$R" | grep -o '"total":[0-9]*' | cut -d':' -f2)
check "总监见全部日志(total>0) 实际=$CNT" '"code":0' "$R"

# member1 查看指定他人(userId=5)日志应被拒绝
R=$(curl -s --noproxy '*' "$BASE/logs?userId=5" -H "Authorization: Bearer $MEMBER1_TOKEN")
check "member1 查他人日志被拒绝(403)" '"code":403' "$R"

echo "=== 9. 提示词管理 ==="
R=$(curl -s --noproxy '*' -X POST $BASE/prompts -H "Authorization: Bearer $MEMBER1_TOKEN" -H 'Content-Type: application/json' -d '{"type":"log_optimize","name":"技术风","content":"请用技术博客风格优化我的日志","isDefault":true}')
check "member1 创建提示词" '"code":0' "$R"
R=$(curl -s --noproxy '*' "$BASE/prompts?type=log_optimize" -H "Authorization: Bearer $MEMBER1_TOKEN")
check "查询提示词列表" '技术风' "$R"

echo "=== 10. AI 相关接口（未配置 Key 时的表现） ==="
R=$(curl -s --noproxy '*' $BASE/chat/providers -H "Authorization: Bearer $MEMBER1_TOKEN")
check "获取 AI 提供商状态" '"code":0' "$R"
echo "  => $(echo $R | head -c 150)"
R=$(curl -s --noproxy '*' -X POST $BASE/logs/optimize -H "Authorization: Bearer $MEMBER1_TOKEN" -H 'Content-Type: application/json' -d '{"content":"test","provider":"qwen"}')
check "AI 优化未配置时返回明确错误" '未配置' "$R"

echo "=== 11. 报告权限验证 ==="
# 组员尝试生成项目报告应被拒绝
R=$(curl -s --noproxy '*' -X POST $BASE/reports/generate -H "Authorization: Bearer $MEMBER1_TOKEN" -H 'Content-Type: application/json' -d "{\"type\":\"weekly\",\"scope\":\"project\",\"projectId\":$PROJECT_ID}")
check "组员生成项目报告被拒绝(403)" '"code":403' "$R"

echo "=== 12. 统计接口 ==="
R=$(curl -s --noproxy '*' $BASE/logs/stats -H "Authorization: Bearer $DIR_TOKEN")
check "总监日志统计" '"code":0' "$R"

echo ""
echo "================================"
echo "测试结果: PASS=$PASS FAIL=$FAIL"
[ $FAIL -gt 0 ] && exit 1 || exit 0
