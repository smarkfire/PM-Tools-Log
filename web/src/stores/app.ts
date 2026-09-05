/**
 * 应用状态：设备类型（响应式断点）
 */
import { defineStore } from 'pinia';

const MOBILE_BREAKPOINT = 768;

export const useAppStore = defineStore('app', {
  state: () => ({
    isMobile: window.innerWidth < MOBILE_BREAKPOINT,
    sidebarCollapsed: false,
    windowWidth: window.innerWidth,
  }),

  actions: {
    init() {
      window.addEventListener('resize', () => {
        this.windowWidth = window.innerWidth;
        this.isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      });
    },
  },
});
