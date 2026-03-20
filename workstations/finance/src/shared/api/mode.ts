/**
 * 真实 / Mock 模式切换
 * 职责：根据 VITE_API_MODE（mock|real）选择执行 real 或 mock；支持 fallbackToMockOnError、onMockCall/onRealCall。
 * 主要导出：createApiCaller、isMockMode、getApiMode、ApiMode、ApiCallerOptions。被 mock-adapter、各 features 下 api 使用。
 * 依赖：@/shared/config/env。被 mock-adapter、业务 api 引用。
 * 涉及后端接口：real 分支才会调后端；mock 分支走 createMockAdapterCaller 注册的 handler。
 * 联调注意点：联调时设 VITE_API_MODE=real；fallbackToMockOnError 会在真实请求失败时回落到 mock，排查时需注意。
 */
import { envConfig, getApiMode, type ApiMode } from "@/shared/config/env";

export type ApiExecutor<T> = () => Promise<T>;

export interface ApiCallerOptions {
  /** 当真实接口失败时是否自动回落到 mock 数据 */
  fallbackToMockOnError?: boolean;
  /** 告知是否走了 mock 数据，便于日志或埋点 */
  onMockCall?: () => void;
  /** 告知是否走了真实接口，便于日志或埋点 */
  onRealCall?: () => void;
}

export const isMockMode = (): boolean => envConfig.apiMode === "mock";

/**
 * 统一的接口调用入口：根据 API_MODE 选择真实接口或 mock。
 */
export const createApiCaller =
  (options: ApiCallerOptions = {}) =>
  async <T>(realRequest: ApiExecutor<T>, mockRequest: ApiExecutor<T>): Promise<T> => {
    if (isMockMode()) {
      options.onMockCall?.();
      return mockRequest();
    }

    try {
      options.onRealCall?.();
      return await realRequest();
    } catch (error) {
      if (options.fallbackToMockOnError) {
        options.onMockCall?.();
        return mockRequest();
      }
      throw error;
    }
  };

export { getApiMode };
export type { ApiMode };
