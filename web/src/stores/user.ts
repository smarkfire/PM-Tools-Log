/**
 * 用户状态管理
 */
import { defineStore } from 'pinia';
import { authApi } from '../api';
import type { AuthUser, UserInfo } from '../types';

interface UserState {
  token: string;
  user: AuthUser | null;
  userInfo: UserInfo | null;
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    userInfo: null,
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    isDirector: (state) => state.user?.role === 'director',
    roleLabel(): string {
      const map: Record<string, string> = {
        director: '项目总监',
        manager: '项目经理',
        leader: '小组长',
        member: '成员',
      };
      return map[this.user?.role || 'member'] || '成员';
    },
  },

  actions: {
    async login(username: string, password: string) {
      const res = await authApi.login({ username, password });
      const { token, user } = res.data;
      this.token = token;
      this.user = user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      await this.fetchUserInfo();
    },

    async register(data: { username: string; email: string; password: string; displayName?: string }) {
      return authApi.register(data);
    },

    async fetchUserInfo() {
      if (!this.token) return;
      const res = await authApi.me();
      this.userInfo = res.data;
      if (this.user) {
        this.user.role = res.data.role;
        localStorage.setItem('user', JSON.stringify(this.user));
      }
    },

    logout() {
      this.token = '';
      this.user = null;
      this.userInfo = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    },
  },
});
