/**
 * 环境与 API 配置
 * 职责：解析 VITE_API_MODE、VITE_API_BASE_URL。本地未配 API_MODE 默认 mock；生产未配默认 real（发票团队共享）。
 * 主要导出：getApiMode、getApiBaseUrl、envConfig、ApiMode。被 client、mode、authService 等使用。
 * 依赖：无（仅 import.meta.env）。被 api/client、api/mode、auth、vite 代理等引用。
 * 涉及后端接口：getApiBaseUrl 作为所有 apiClient 与登录请求的 BaseURL。
 * 联调注意点：开发用 /api 时由 Vite proxy 转发至 localhost:8001；离线开发可设 VITE_API_MODE=mock。
 */
export type ApiMode = "mock" | "real";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8001/api/v1";
// 本地未配置时默认 real（与其余工作台一致，数据走 Django→PostgreSQL）；离线可设 VITE_API_MODE=mock
const DEFAULT_API_MODE_DEV: ApiMode = "real";
const DEFAULT_API_MODE_PROD: ApiMode = "real";

const sanitizeBaseUrl = (baseUrl: string): string =>
  baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;

const normalizeApiMode = (mode: unknown): ApiMode => {
  if (typeof mode !== "string" || mode.trim() === "") {
    return import.meta.env.PROD ? DEFAULT_API_MODE_PROD : DEFAULT_API_MODE_DEV;
  }

  const normalized = mode.trim().toLowerCase();
  if (normalized === "real") {
    return "real";
  }
  if (normalized === "mock") {
    return "mock";
  }
  return import.meta.env.PROD ? DEFAULT_API_MODE_PROD : DEFAULT_API_MODE_DEV;
};

const resolveApiBaseUrl = (): string => {
  const raw = typeof import.meta.env.VITE_API_BASE_URL === "string" ? import.meta.env.VITE_API_BASE_URL : "";
  if (raw) {
    // 如果用户提供了完整URL，确保以/v1结尾
    const sanitized = sanitizeBaseUrl(raw);
    return sanitized.endsWith("/v1") ? sanitized : `${sanitized}/v1`;
  }

  if (import.meta.env.DEV) {
    return "/api/v1";
  }

  // 生产未配置时走同源 /api/v1（与 nginx 反代 Django 一致）；勿用 127.0.0.1（浏览器无法访问）
  return "/api/v1";
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
