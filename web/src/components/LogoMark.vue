<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :style="{ color }"
    aria-label="MateLog 脉络"
  >
    <!-- 主脉：由细到粗向上汇聚 -->
    <path
      d="M9 39C17 33 25 27 38.5 9.5"
      stroke="currentColor"
      stroke-width="3.4"
      stroke-linecap="round"
    />
    <!-- 支脉三条 -->
    <path
      d="M15.5 33.5C20.5 33.5 25.5 31.5 29.5 27.5"
      stroke="currentColor"
      stroke-width="2.8"
      stroke-linecap="round"
    />
    <path
      d="M22.5 27.5C27.5 27.5 32.5 24.5 36.5 20.5"
      stroke="currentColor"
      stroke-width="2.8"
      stroke-linecap="round"
      opacity="0.9"
    />
    <path
      d="M29.5 21C34 21 37.5 18.5 40.5 15"
      stroke="currentColor"
      stroke-width="2.8"
      stroke-linecap="round"
      opacity="0.8"
    />
    <!-- 汇聚节点 -->
    <circle cx="38.5" cy="9.5" r="3.4" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string; color?: string }>(), {
  size: 24,
  color: 'currentColor',
});
</script>
