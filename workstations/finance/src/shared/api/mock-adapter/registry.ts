/**
 * Mock Handler 注册表
 * 职责：registerMockHandlers 注册 key→handler；getMockHandler、callMockHandler 供 createMockAdapterCaller 使用。
 * 主要导出：registerMockHandlers、getMockHandler、callMockHandler、listRegisteredMocks。
 * 依赖：./types。被 mock-adapter/index、各 handlers 的 register*Mocks 使用。
 * 涉及后端接口：无。仅 mock 数据。
 * 联调注意点：key 与业务 api 中 callWithMock 第一参一致；handler 未注册会抛 "Mock handler not found"。
 */
import type { MockHandler, MockHandlerConfig } from "./types";

const mockRegistry = new Map<string, MockHandler<any, any>>();

const normalizeHandlers = (
  handlers: MockHandlerConfig<any, any> | MockHandlerConfig<any, any>[]
): MockHandlerConfig<any, any>[] => (Array.isArray(handlers) ? handlers : [handlers]);

export const registerMockHandlers = (
  handlers: MockHandlerConfig<any, any> | MockHandlerConfig<any, any>[]
): void => {
  normalizeHandlers(handlers).forEach(({ key, handler }) => {
    if (!key) return;
    if (mockRegistry.has(key)) {
      // Prefer newest handler to allow overrides while keeping a warning for awareness.
      console.warn(`[mock-adapter] overriding mock handler: ${key}`);
    }
    mockRegistry.set(key, handler);
  });
};

export const getMockHandler = <T = unknown, P = void>(key: string): MockHandler<T, P> | undefined => {
  return mockRegistry.get(key) as MockHandler<T, P> | undefined;
};

export const callMockHandler = async <T = unknown, P = void>(key: string, params?: P): Promise<T> => {
  const handler = getMockHandler<T, P>(key);
  if (!handler) {
    throw new Error(`Mock handler not found for key: ${key}`);
  }
  const result = handler(params);
  return result instanceof Promise ? await result : (result as T);
};

export const listRegisteredMocks = (): string[] => Array.from(mockRegistry.keys());
