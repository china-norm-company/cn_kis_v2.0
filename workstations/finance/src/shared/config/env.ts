/**
 * 环境与 API 配置
 * 职责：解析 VITE_API_MODE（mock|real）、VITE_API_BASE_URL；开发默认 /api/v1，生产默认 http://127.0.0.1:8000/api/v1。
 * 主要导出：getApiMode、getApiBaseUrl、envConfig、ApiMode。被 client、mode、authService 等使用。
 * 依赖：无（仅 import.meta.env）。被 api/client、api/mode、auth、vite 代理等引用。
 * 涉及后端接口：getApiBaseUrl 作为所有 apiClient 与登录请求的 BaseURL。
 * 联调注意点：VITE_API_MODE=real 且 VITE_API_BASE_URL 指向后端（如 http://localhost:8000/api）；开发用 /api 时由 Vite proxy 转发。
 */
export type ApiMode = "mock" | "real";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api/v1";
// 开发环境默认使用 real 模式，确保联调开箱即用
// 财务台「发票管理（新）」5 模块使用本地 mock，不依赖后端
const DEFAULT_API_MODE: ApiMode = "mock";

const sanitizeBaseUrl = (baseUrl: string): string =>
  baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

const normalizeApiMode = (mode: unknown): ApiMode => {
  if (typeof mode !== "string") {
    return DEFAULT_API_MODE;
  }

  const normalized = mode.trim().toLowerCase();
  // 明确支持 "real" 和 "mock" 两种模式
  if (normalized === "real") {
    return "real";
  }
  if (normalized === "mock") {
    return "mock";
  }
  // 其他值使用默认模式
  return DEFAULT_API_MODE;
};

const resolveApiBaseUrl = (): string => {
  const raw = typeof import.meta.env.VITE_API_BASE_URL === "string" ? import.meta.env.VITE_API_BASE_URL : "";
  if (raw) {
    // 如果用户提供了完整URL，确保以/v1结尾
    const sanitized = sanitizeBaseUrl(raw);
    return sanitized.endsWith("/v1") ? sanitized : `${sanitized}/v1`;
  }

  if (import.meta.env.DEV) {
    // 开发环境使用 /api/v1，由 Vite 代理转发
    return "/api/v1";
  }

  return DEFAULT_API_BASE_URL;
};

export const getApiBaseUrl = (): string => resolveApiBaseUrl();

export const getApiMode = (): ApiMode => {
  const rawMode = import.meta.env.VITE_API_MODE;
  return normalizeApiMode(rawMode);
};

const normalizeBooleanEnv = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

export const getSkipLoginEnabled = (): boolean => {
  // 仅允许开发环境默认开启；生产环境必须显式开关
  if (import.meta.env.DEV) {
    return true;
  }
  return normalizeBooleanEnv(import.meta.env.VITE_ENABLE_SKIP_LOGIN);
};

export const envConfig = {
  apiBaseUrl: getApiBaseUrl(),
  apiMode: getApiMode(),
  isDev: Boolean(import.meta.env.DEV),
  skipLoginEnabled: getSkipLoginEnabled(),
};
