<template>
  <div class="login-page">
    <!-- 背景装饰 -->
    <div class="bg-decor bg-decor--1"></div>
    <div class="bg-decor bg-decor--2"></div>

    <div class="login-card">
      <div class="login-header">
        <div class="logo-mark">
          <LogoMark :size="30" color="#fff" />
        </div>
        <h1>MateLog 脉络</h1>
        <p class="slogan">一人一记，汇聚成组织的脉络</p>
        <p class="subtitle">项目日志 · AI 优化 · 智能报告</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名 / 邮箱" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" class="submit-btn" :loading="loading" @click="handleLogin">
            登 录
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        还没有账号？
        <router-link to="/register">立即注册</router-link>
      </div>
    </div>

    <!-- 页脚品牌行 -->
    <div class="page-foot">MateLog 脉络 · 每天 5 分钟，周报月报自动生成</div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import LogoMark from '../components/LogoMark.vue';
import { useUserStore } from '../stores/user';

const router = useRouter();
const userStore = useUserStore();
const formRef = ref();
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function handleLogin() {
  await formRef.value?.validate();
  loading.value = true;
  try {
    await userStore.login(form.username, form.password);
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #16222f 0%, #1d2939 40%, #2a3a52 100%);
  padding: 16px;
  position: relative;
  overflow: hidden;
}

/* 背景光斑装饰 */
.bg-decor {
  /* fixed 定位：避免 absolute 溢出造成横向滚动条，且不随内容滚动 */
  position: fixed;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  pointer-events: none;
}

.bg-decor--1 {
  width: 400px;
  height: 400px;
  background: #409eff;
  top: -120px;
  right: -80px;
  animation: drift-1 24s ease-in-out infinite;
}

.bg-decor--2 {
  width: 320px;
  height: 320px;
  background: #7d3bc4;
  bottom: -100px;
  left: -60px;
  animation: drift-2 28s ease-in-out infinite;
}

@keyframes drift-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-40px, 30px) scale(1.08); }
}

@keyframes drift-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(50px, -24px) scale(0.94); }
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  padding: 40px 36px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
  position: relative;
  z-index: 1;
  animation: card-in 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

/* 头部级联入场：Logo → 标题 → 品牌语 → 副标题 依次浮现 */
@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.logo-mark {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%);
  box-shadow: 0 6px 18px rgba(64, 158, 255, 0.4);
  animation:
    fade-up 0.5s ease 0.08s both,
    pulse-glow 3.2s ease-in-out 0.8s infinite;
}

/* Logo 呼吸光：呼应脉络汇聚节点 */
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 6px 18px rgba(64, 158, 255, 0.4);
  }
  50% {
    box-shadow: 0 6px 28px rgba(64, 158, 255, 0.62);
  }
}

.login-header h1 {
  font-size: 22px;
  margin-top: 14px;
  color: var(--text-primary, #303133);
  font-weight: 700;
  letter-spacing: 0.5px;
  animation: fade-up 0.5s ease 0.16s both;
}

.slogan {
  color: var(--text-secondary, #a3a8b3);
  font-size: 14px;
  letter-spacing: 2px;
  margin-top: 8px;
  animation: fade-up 0.5s ease 0.26s both;
}

.subtitle {
  color: var(--text-secondary, #909399);
  font-size: 13px;
  margin-top: 6px;
  animation: fade-up 0.5s ease 0.34s both;
}

.submit-btn {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 4px;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.35);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(64, 158, 255, 0.48);
}

.submit-btn:active {
  transform: translateY(0);
}

.login-footer {
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary, #909399);
  margin-top: 10px;
}

.login-footer a {
  color: var(--primary-color, #409eff);
  text-decoration: none;
  font-weight: 500;
}

.login-footer a:hover {
  text-decoration: underline;
}

/* 页脚品牌行 */
.page-foot {
  position: fixed;
  bottom: 18px;
  left: 0;
  right: 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  letter-spacing: 1px;
  pointer-events: none;
}

/* 小屏适配 */
@media (max-width: 480px) {
  .login-card {
    padding: 30px 22px;
  }
}

/* 尊重系统"减少动态"偏好 */
@media (prefers-reduced-motion: reduce) {
  .login-card,
  .logo-mark,
  .login-header h1,
  .slogan,
  .subtitle,
  .bg-decor {
    animation: none !important;
  }
  .submit-btn {
    transition: none;
  }
}
</style>
