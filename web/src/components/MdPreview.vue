<template>
  <div class="md-preview markdown-body" v-html="rendered"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';

// html:false 禁止原始 HTML 标签（防 XSS），仅渲染标准 Markdown 语法
const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

const props = defineProps<{ content?: string }>();

const rendered = computed(() => {
  if (!props.content) return '';
  return md.render(props.content);
});
</script>

<style>
/* Markdown 渲染样式（全局，非 scoped） */
.md-preview.markdown-body {
  font-size: 14px;
  line-height: 1.75;
  color: #303133;
  word-break: break-word;
}

.md-preview.markdown-body h1,
.md-preview.markdown-body h2,
.md-preview.markdown-body h3,
.md-preview.markdown-body h4 {
  margin: 14px 0 8px;
  font-weight: 600;
  line-height: 1.4;
}

.md-preview.markdown-body h1 { font-size: 18px; }
.md-preview.markdown-body h2 { font-size: 16px; }
.md-preview.markdown-body h3 { font-size: 15px; }
.md-preview.markdown-body h4 { font-size: 14px; }

.md-preview.markdown-body p {
  margin: 6px 0;
}

.md-preview.markdown-body ul,
.md-preview.markdown-body ol {
  padding-left: 22px;
  margin: 6px 0;
}

.md-preview.markdown-body li {
  margin: 3px 0;
}

.md-preview.markdown-body strong {
  font-weight: 600;
  color: #1f2d3d;
}

.md-preview.markdown-body blockquote {
  margin: 8px 0;
  padding: 8px 12px;
  border-left: 3px solid #dcdfe6;
  background: #f8f9fb;
  color: #606266;
  border-radius: 0 4px 4px 0;
}

.md-preview.markdown-body code {
  padding: 1px 5px;
  margin: 0 2px;
  border-radius: 3px;
  background: #f0f2f5;
  color: #476582;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.md-preview.markdown-body pre {
  margin: 8px 0;
  padding: 12px;
  background: #282c34;
  border-radius: 6px;
  overflow-x: auto;
}

.md-preview.markdown-body pre code {
  padding: 0;
  margin: 0;
  background: none;
  color: #abb2bf;
  font-size: 13px;
  line-height: 1.6;
}

.md-preview.markdown-body table {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.md-preview.markdown-body th,
.md-preview.markdown-body td {
  border: 1px solid #ebeef5;
  padding: 6px 10px;
  text-align: left;
  font-size: 13px;
}

.md-preview.markdown-body th {
  background: #f5f7fa;
  font-weight: 600;
}

.md-preview.markdown-body tr:nth-child(2n) td {
  background: #fafbfc;
}

.md-preview.markdown-body a {
  color: #409eff;
  text-decoration: none;
}

.md-preview.markdown-body a:hover {
  text-decoration: underline;
}

.md-preview.markdown-body hr {
  border: none;
  border-top: 1px solid #ebeef5;
  margin: 12px 0;
}
</style>
