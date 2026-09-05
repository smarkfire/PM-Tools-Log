/**
 * 系统配置状态：菜单可见性开关（管理员在系统设置中控制）
 */
import { defineStore } from 'pinia';
import { configApi, type MenuVisibility } from '../api';

interface ConfigState {
  menus: MenuVisibility | null;
  loaded: boolean;
}

const DEFAULT_MENUS: MenuVisibility = {
  logsWrite: true,
  logs: true,
  logsAll: true,
  projects: true,
  reports: true,
  chat: true,
  prompts: true,
  users: true,
  aiSettings: true,
};

export const useConfigStore = defineStore('config', {
  state: (): ConfigState => ({
    menus: null,
    loaded: false,
  }),

  getters: {
    /** 菜单开关（未加载完成时默认全部可见） */
    menuVisibility(state): MenuVisibility {
      return state.menus || DEFAULT_MENUS;
    },
  },

  actions: {
    /** 拉取菜单开关配置 */
    async fetchMenus() {
      try {
        const res = await configApi.menus();
        this.menus = { ...DEFAULT_MENUS, ...res.data?.menus };
        this.loaded = true;
      } catch {
        // 接口异常时不阻塞导航，按默认显示
        this.menus = { ...DEFAULT_MENUS };
        this.loaded = true;
      }
    },

    /** 重置（登出时调用） */
    reset() {
      this.menus = null;
      this.loaded = false;
    },
  },
});
