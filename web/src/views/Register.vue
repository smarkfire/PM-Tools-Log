<template>
  <div class="login-page">
    <div class="bg-decor bg-decor--1"></div>
    <div class="bg-decor bg-decor--2"></div>

    <div class="login-card">
      <div class="login-header">
        <div class="logo-mark">
          <LogoMark :size="26" color="#fff" />
        </div>
        <h1>注册账号</h1>
        <p class="subtitle">加入 LogMate 络脉，记录每一天</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="displayName">
          <el-input v-model="form.displayName" placeholder="姓名 / 昵称" :prefix-icon="Avatar" />
        </el-form-item>
        <el-form-item prop="email">
          <el-input v-model="form.email" placeholder="邮箱" :prefix-icon="Message" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码（至少6位）"
            show-password
            :prefix-icon="Lock"
          />
        </el-form-item>
        <el-form-item prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="确认密码"
            show-password
            :prefix-icon="Lock"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" class="submit-btn" :loading="loading" @click="handleRegister">
            注 册
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        已有账号？
        <router-link to="/login">直接登录</router-link>
      </div>
      <el-alert
        class="tip"
        type="info"
        :closable="false"
        title="首个注册的用户将自动成为项目总监"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock, Message, Avatar } from '@element-plus/icons-vue';
import LogoMark from '../components/LogoMark.vue';
import { useUserStore } from '../stores/user';

const router = useRouter();
const userStore = useUserStore();
const formRef = ref();
const loading = ref(false);

const form = reactive({
  username: '',
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
});

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 50, message: '用户名长度 2-50 个字符', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' },
  ],
  confirmPassword: [
    {
      required: true,
      validator: (_rule: any, value: string, callback: any) => {
        if (!value) callback(new Error('请再次输入密码'));
        else if (value !== form.password) callback(new Error('两次输入的密码不一致'));
        else callback();
      },
      trigger: 'blur',
    },
  ],
};

async function handleRegister() {
  await formRef.value?.validate();
  loading.value = true;
  try {
    await userStore.register({
      username: form.username,
      email: form.email,
      password: form.password,
      displayName: form.displayName || form.username,
    });
    ElMessage.success('注册成功，请登录');
    router.push('/login');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  position: relative;
}

/* 固定背景层：内容超高滚动时背景始终铺满视口 */
.login-page::before {
  content: '';
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, #16222f 0%, #1d2939 40%, #2a3a52 100%);
  z-index: -1;
}

.bg-decor {
  position: absolute;
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
}

.bg-decor--2 {
  width: 320px;
  height: 320px;
  background: #7d3bc4;
  bottom: -100px;
  left: -60px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  padding: 34px 32px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
  position: relative;
  z-index: 1;
  animation: card-in 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes card-in {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.login-header {
  text-align: center;
  margin-bottom: 22px;
}

.logo-mark {
  width: 48px;
  height: 48px;
  border-radius: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%);
  box-shadow: 0 6px 18px rgba(64, 158, 255, 0.4);
}

.login-header h1 {
  font-size: 22px;
  margin-top: 12px;
  color: var(--text-primary, #303133);
  font-weight: 700;
  letter-spacing: 0.5px;
}

.subtitle {
  color: var(--text-secondary, #909399);
  font-size: 13px;
  margin-top: 6px;
}

.submit-btn {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 4px;
  box-shadow: 0 4px 14px rgba(64, 158, 255, 0.35);
}

.login-footer {
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary, #909399);
  margin-top: 8px;
}

.login-footer a {
  color: var(--primary-color, #409eff);
  text-decoration: none;
  font-weight: 500;
}

.tip {
  margin-top: 14px;
  border-radius: 8px;
}

@media (max-width: 480px) {
  .login-card {
    padding: 26px 18px;
  }
}
</style>
