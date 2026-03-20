/**
 * Mock 适配器最小实现：仅用 createApiCaller + 调用方传入的 mockRequest，不依赖 handlers 注册
 * 财务台 5 个模块均自带 mock（storage），无需原型侧 registry
 */
import { createApiCaller, type ApiCallerOptions, type ApiExecutor } from "@/shared/api/mode";

export interface MockAdapterOptions extends ApiCallerOptions {
  onMissingMock?: (key: string) => void;
}

export const createMockAdapterCaller = (options: MockAdapterOptions = {}) => {
  const caller = createApiCaller(options);
  return async <T, P = void>(
    _key: string,
    realRequest: ApiExecutor<T>,
    mockRequest?: ApiExecutor<T>
  ): Promise<T> => {
    const resolvedMockRequest =
      mockRequest ??
      (async () => {
        options.onMissingMock?.(_key);
        throw new Error(`[mock-adapter] No mockRequest for key: ${_key}`);
      });
    return caller(realRequest, resolvedMockRequest);
  };
};
