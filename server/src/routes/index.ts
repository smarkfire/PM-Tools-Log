/**
 * 路由注册（所有异步控制器使用 asyncHandler 包装，确保异常进入错误中间件）
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import * as authController from '../controllers/auth.controller';
import * as userController from '../controllers/user.controller';
import * as projectController from '../controllers/project.controller';
import * as logController from '../controllers/log.controller';
import * as reportController from '../controllers/report.controller';
import * as promptController from '../controllers/prompt.controller';
import * as chatController from '../controllers/chat.controller';

const router = Router();
const wrap = asyncHandler;

// ==================== 认证 ====================
router.post('/auth/register', wrap(authController.register));
router.post('/auth/login', wrap(authController.login));
router.get('/auth/me', authMiddleware, wrap(authController.me));
router.put('/auth/profile', authMiddleware, wrap(authController.updateProfile));
router.put('/auth/password', authMiddleware, wrap(authController.changePassword));

// ==================== 用户管理 ====================
router.get('/users', authMiddleware, wrap(userController.listUsers));
router.put('/users/:id/role', authMiddleware, wrap(userController.updateUserRole));
router.get('/users/available', authMiddleware, wrap(userController.listAvailableUsers));

// ==================== 项目管理 ====================
router.get('/projects', authMiddleware, wrap(projectController.listProjects));
router.post('/projects', authMiddleware, wrap(projectController.createProject));
router.put('/projects/:id', authMiddleware, wrap(projectController.updateProject));
router.post('/projects/:id/members', authMiddleware, wrap(projectController.addMember));
router.put('/projects/:id/members/:memberUserId', authMiddleware, wrap(projectController.updateMember));
router.delete('/projects/:id/members/:memberUserId', authMiddleware, wrap(projectController.removeMember));
router.post('/projects/:id/groups', authMiddleware, wrap(projectController.createGroup));
router.delete('/projects/:id/groups/:groupId', authMiddleware, wrap(projectController.deleteGroup));

// ==================== 工作日志 ====================
router.get('/logs', authMiddleware, wrap(logController.listLogs));
router.get('/logs/stats', authMiddleware, wrap(logController.logStats));
router.get('/logs/:id', authMiddleware, wrap(logController.getLog));
router.post('/logs', authMiddleware, wrap(logController.saveLog));
router.delete('/logs/:id', authMiddleware, wrap(logController.deleteLog));
router.post('/logs/optimize', authMiddleware, wrap(logController.optimizeLog));

// ==================== 报告 ====================
router.post('/reports/generate', authMiddleware, wrap(reportController.generateReport));
router.get('/reports', authMiddleware, wrap(reportController.listReports));
router.get('/reports/:id', authMiddleware, wrap(reportController.getReport));
router.delete('/reports/:id', authMiddleware, wrap(reportController.deleteReport));

// ==================== 提示词 ====================
router.get('/prompts', authMiddleware, wrap(promptController.listPrompts));
router.post('/prompts', authMiddleware, wrap(promptController.createPrompt));
router.put('/prompts/:id', authMiddleware, wrap(promptController.updatePrompt));
router.delete('/prompts/:id', authMiddleware, wrap(promptController.deletePrompt));

// ==================== AI 对话 ====================
router.get('/chat/providers', authMiddleware, wrap(chatController.getProviders));
router.get('/chat/conversations', authMiddleware, wrap(chatController.listConversations));
router.post('/chat/conversations', authMiddleware, wrap(chatController.createConversation));
router.delete('/chat/conversations/:id', authMiddleware, wrap(chatController.deleteConversation));
router.get('/chat/conversations/:id/messages', authMiddleware, wrap(chatController.getMessages));
router.post('/chat/conversations/:id/messages', authMiddleware, wrap(chatController.sendMessage));

// ==================== 系统配置 / 用户 AI 配置 / 菜单开关 ====================
import * as systemConfigController from '../controllers/systemConfig.controller';
// 管理员：系统设置（AI Key、菜单开关）
router.get('/admin/config', authMiddleware, wrap(systemConfigController.getAdminConfig));
router.put('/admin/config', authMiddleware, wrap(systemConfigController.updateAdminConfig));
// 用户：自己的 AI Key 配置
router.get('/ai-config', authMiddleware, wrap(systemConfigController.getMyAiConfig));
router.put('/ai-config', authMiddleware, wrap(systemConfigController.updateMyAiConfig));
// 菜单可见性（前端侧边栏动态显示）
router.get('/config/menus', authMiddleware, wrap(systemConfigController.getVisibleMenus));

// ==================== 修改审批（日志/报告跨周修改） ====================
import * as approvalController from '../controllers/approval.controller';
router.post('/approvals', authMiddleware, wrap(approvalController.createApproval));
router.get('/approvals/mine', authMiddleware, wrap(approvalController.listMyApprovals));
router.get('/approvals/pending', authMiddleware, wrap(approvalController.listPendingApprovals));
router.put('/approvals/:id', authMiddleware, wrap(approvalController.handleApproval));

// ==================== 报告编辑 ====================
router.put('/reports/:id', authMiddleware, wrap(reportController.updateReport));

// ==================== 用户反馈 ====================
import * as feedbackController from '../controllers/feedback.controller';
router.post('/feedback', authMiddleware, wrap(feedbackController.createFeedback));
router.get('/feedback/mine', authMiddleware, wrap(feedbackController.listMyFeedback));
router.get('/admin/feedback', authMiddleware, wrap(feedbackController.listAllFeedback));
router.put('/admin/feedback/:id', authMiddleware, wrap(feedbackController.replyFeedback));

// ==================== 版本管理 ====================
import * as versionController from '../controllers/version.controller';
router.get('/versions', authMiddleware, wrap(versionController.listVersions));
router.get('/admin/versions', authMiddleware, wrap(versionController.listAdminVersions));
router.post('/admin/versions', authMiddleware, wrap(versionController.releaseVersion));
router.delete('/admin/versions/:id', authMiddleware, wrap(versionController.deleteVersion));

// ==================== 收件箱通知 ====================
import * as notificationController from '../controllers/notification.controller';
router.get('/notifications', authMiddleware, wrap(notificationController.listNotifications));
router.get('/notifications/unread-count', authMiddleware, wrap(notificationController.unreadCount));
router.put('/notifications/:id/read', authMiddleware, wrap(notificationController.markRead));
router.put('/notifications/read-all', authMiddleware, wrap(notificationController.markAllRead));

export default router;
