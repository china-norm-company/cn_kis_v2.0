/**
 * 统一 HTTP 客户端
 * 职责：封装 get/post/put/patch/delete，自动加 Authorization: Bearer {localStorage['auth_token']}、BaseURL、Content-Type，并解析 JSON 错误信息。
 * 主要导出：apiClient、ApiResponse。被 request.ts、各 features 下 api 使用。
 * 依赖：@/shared/config/env（getApiBaseUrl）。被 shared/lib/request、features 下 api 引用。
 * 涉及后端接口：所有真实请求的底层；路径由调用方传入，如 /crm/orders、/work-orders、/workbench/orders 等。
 * 联调注意点：鉴权头取自 auth_token（与 Feishu 登录后存储的 key 一致），登录前或 token 失效会 401；错误从 response body 的 message/error/detail 取；开发时 /api 经 Vite 代理到 127.0.0.1:8000。
 */
import { envConfig, getApiBaseUrl } from "@/shared/config/env";

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  message: string;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
}

const defaultHeaders: Record<string, string> = {
  Accept: "application/json",
};

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const buildUrl = (path: string, params?: Record<string, unknown>): string => {
  const baseUrl = getApiBaseUrl();
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${normalizedBase}${normalizedPath}`;

  if (!params || Object.keys(params).length === 0) {
    return url;
  }

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, String(item)));
    } else {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
};

type ApiClientError = Error & { status?: number; data?: unknown };

/**
 * 后端统一响应格式
 */
interface StandardResponse<T> {
  success: boolean;
  data: T | null;
  message: string;
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("Content-Type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => undefined) : await response.text().catch(() => undefined);

  if (!response.ok) {
    // 处理错误响应（后端使用 StandardResponse 格式）
    let errorMessage = `HTTP error! status: ${response.status}`;
    
    if (payload && typeof payload === "object") {
      const standardResponse = payload as StandardResponse<unknown>;
      // 优先使用 StandardResponse 的 message
      if (standardResponse.message && typeof standardResponse.message === "string") {
        errorMessage = standardResponse.message;
      } else {
        // 兼容其他错误格式
        const message = (payload as Record<string, unknown>).message;
        const error = (payload as Record<string, unknown>).error;
        const detail = (payload as Record<string, unknown>).detail;
        const fallbackMessage =
          (typeof message === "string" ? message : null) ??
          (typeof error === "string" ? error : null) ??
          (typeof detail === "string" ? detail : null);
        if (fallbackMessage) {
          errorMessage = fallbackMessage;
        }
      }
    }

    const error: ApiClientError = new Error(
      typeof errorMessage === "string" && errorMessage.trim().length > 0
        ? errorMessage
        : errorMessage
    );
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  // 处理成功响应：后端使用 StandardResponse<T> 格式，需要提取 data 字段
  if (payload && typeof payload === "object") {
    const standardResponse = payload as StandardResponse<T>;
    // 如果响应是 StandardResponse 格式，提取 data 字段
    if ("success" in standardResponse && "data" in standardResponse) {
      // 如果 success 为 false，即使 HTTP 状态码是 200，也应该抛出错误
      if (standardResponse.success === false) {
        const errorMessage = standardResponse.message || "请求失败";
        const error: ApiClientError = new Error(errorMessage);
        error.status = response.status;
        error.data = payload;
        throw error;
      }
      // 如果 data 是 null，返回 null（调用方需要处理）
      // 注意：React Query 不允许返回 undefined，但可以返回 null
      if (standardResponse.data === null) {
        return null as T;
      }
      return standardResponse.data as T;
    }
  }

  // 如果没有 payload，返回 null 而不是 undefined
  return (payload as T) ?? (null as T);
};

const logRequestError = (method: HttpMethod, url: string, error: unknown) => {
  // 错误日志已移除，错误会通过 throw 向上传播
};

const request = async <T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> => {
  const { params, headers, body } = options;
  const url = buildUrl(path, params);
  const requestHeaders: Record<string, string> = {
    ...defaultHeaders,
    ...getAuthHeaders(),
    ...(headers || {}),
  };

  const init: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
      delete (requestHeaders as Record<string, string>)["Content-Type"];
    } else {
      init.body = JSON.stringify(body);
      requestHeaders["Content-Type"] = "application/json";
    }
  }

  try {
    const response = await fetch(url, init);
    const data = await parseResponse<T>(response);
    return { data, status: response.status, message: response.statusText || "OK" };
  } catch (error) {
    logRequestError(method, url, error);
    throw error;
  }
};

export const apiClient = {
  get: <T = unknown>(url: string, options?: Pick<RequestOptions, "params" | "headers">) =>
    request<T>("GET", url, options),
  post: <T = unknown>(url: string, body: unknown, options?: Pick<RequestOptions, "headers">) =>
    request<T>("POST", url, { ...options, body }),
  put: <T = unknown>(url: string, body: unknown, options?: Pick<RequestOptions, "headers">) =>
    request<T>("PUT", url, { ...options, body }),
  patch: <T = unknown>(url: string, body: unknown, options?: Pick<RequestOptions, "headers">) =>
    request<T>("PATCH", url, { ...options, body }),
  delete: <T = unknown>(url: string, options?: Pick<RequestOptions, "headers">) =>
    request<T>("DELETE", url, options),
};
