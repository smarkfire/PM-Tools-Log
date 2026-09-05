/**
 * 统一响应格式工具
 */
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export function success<T>(data?: T, message = '操作成功'): ApiResponse<T> {
  return { code: 0, message, data };
}

export function fail(message: string, code = 1): ApiResponse<never> {
  return { code, message };
}
