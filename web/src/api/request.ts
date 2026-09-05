/**
 * Axios 实例与请求/响应拦截器
 */
import axios from 'axios';
import { ElMessage } from 'element-plus';

const request = axios.create({
  baseURL: '/api',
  timeout: 120000, // AI 接口可能较慢
});

// 请求拦截器：附加 token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：统一处理错误
request.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res && res.code !== 0) {
      ElMessage.error(res.message || '请求失败');
      return Promise.reject(new Error(res.message));
    }
    return res;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      ElMessage.error('登录已过期，请重新登录');
    } else {
      const msg = error.response?.data?.message || error.message || '网络错误';
      ElMessage.error(msg);
    }
    return Promise.reject(error);
  }
);

export default request;
