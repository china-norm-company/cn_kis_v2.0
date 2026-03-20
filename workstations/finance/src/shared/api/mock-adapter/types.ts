export type MockHandler<T = unknown, P = void> = (params?: P) => Promise<T> | T;

export interface MockHandlerConfig<T = unknown, P = void> {
  key: string;
  handler: MockHandler<T, P>;
  description?: string;
}
