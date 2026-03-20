/**
 * TanStack Query缓存配置
 * 
 * 提供统一的查询配置和缓存策略
 * 
 * 特性：
 * - 预定义缓存时间
 * - 查询键生成
 * - 乐观更新支持
 * - 查询失效策略
 */

import { 
  QueryClient, 
  QueryKey,
  UseQueryOptions,
  UseMutationOptions,
  MutationFunction,
} from "@tanstack/react-query";

// ============ 缓存时间常量 ============

export const CACHE_TIME = {
  /** 短期缓存（1分钟）- 频繁变化的数据 */
  SHORT: 1000 * 60,
  /** 中期缓存（5分钟）- 一般数据 */
  MEDIUM: 1000 * 60 * 5,
  /** 长期缓存（30分钟）- 不常变化的数据 */
  LONG: 1000 * 60 * 30,
  /** 持久缓存（1小时）- 静态数据 */
  PERSISTENT: 1000 * 60 * 60,
  /** 会话缓存（页面刷新后失效）*/
  SESSION: Infinity,
} as const;

export const STALE_TIME = {
  /** 立即过期（每次都重新获取）*/
  NONE: 0,
  /** 短期新鲜（30秒）*/
  SHORT: 1000 * 30,
  /** 中期新鲜（2分钟）*/
  MEDIUM: 1000 * 60 * 2,
  /** 长期新鲜（10分钟）*/
  LONG: 1000 * 60 * 10,
  /** 持久新鲜（30分钟）*/
  PERSISTENT: 1000 * 60 * 30,
} as const;

// ============ 查询键工厂 ============

/**
 * 查询键生成器
 * 
 * 使用结构化的键管理查询缓存
 * 
 * Usage:
 *   queryKeys.subjects.list({ page: 1 })
 *   queryKeys.subjects.detail(123)
 */
export const queryKeys = {
  // 受试者
  subjects: {
    all: ["subjects"] as const,
    lists: () => [...queryKeys.subjects.all, "list"] as const,
    list: (filters: Record<string, any>) => 
      [...queryKeys.subjects.lists(), filters] as const,
    details: () => [...queryKeys.subjects.all, "detail"] as const,
    detail: (id: number | string) => 
      [...queryKeys.subjects.details(), id] as const,
  },
  
  // 项目
  projects: {
    all: ["projects"] as const,
    lists: () => [...queryKeys.projects.all, "list"] as const,
    list: (filters: Record<string, any>) => 
      [...queryKeys.projects.lists(), filters] as const,
    details: () => [...queryKeys.projects.all, "detail"] as const,
    detail: (id: number | string) => 
      [...queryKeys.projects.details(), id] as const,
    statistics: (id: number | string) =>
      [...queryKeys.projects.detail(id), "statistics"] as const,
  },
  
  // 客户
  customers: {
    all: ["customers"] as const,
    lists: () => [...queryKeys.customers.all, "list"] as const,
    list: (filters: Record<string, any>) => 
      [...queryKeys.customers.lists(), filters] as const,
    details: () => [...queryKeys.customers.all, "detail"] as const,
    detail: (id: number | string) => 
      [...queryKeys.customers.details(), id] as const,
  },
  
  // 访视
  visits: {
    all: ["visits"] as const,
    lists: () => [...queryKeys.visits.all, "list"] as const,
    list: (filters: Record<string, any>) => 
      [...queryKeys.visits.lists(), filters] as const,
    calendar: (month: string) =>
      [...queryKeys.visits.all, "calendar", month] as const,
    details: () => [...queryKeys.visits.all, "detail"] as const,
    detail: (id: number | string) => 
      [...queryKeys.visits.details(), id] as const,
  },
  
  // 样品
  samples: {
    all: ["samples"] as const,
    lists: () => [...queryKeys.samples.all, "list"] as const,
    list: (filters: Record<string, any>) => 
      [...queryKeys.samples.lists(), filters] as const,
    details: () => [...queryKeys.samples.all, "detail"] as const,
    detail: (id: number | string) => 
      [...queryKeys.samples.details(), id] as const,
    statistics: () => [...queryKeys.samples.all, "statistics"] as const,
  },
  
  // 报告
  reports: {
    all: ["reports"] as const,
    lists: () => [...queryKeys.reports.all, "list"] as const,
    list: (filters: Record<string, any>) => 
      [...queryKeys.reports.lists(), filters] as const,
    details: () => [...queryKeys.reports.all, "detail"] as const,
    detail: (id: number | string) => 
      [...queryKeys.reports.details(), id] as const,
    templates: () => [...queryKeys.reports.all, "templates"] as const,
  },
  
  // 任务
  tasks: {
    all: ["tasks"] as const,
    lists: () => [...queryKeys.tasks.all, "list"] as const,
    list: (filters: Record<string, any>) => 
      [...queryKeys.tasks.lists(), filters] as const,
    details: () => [...queryKeys.tasks.all, "detail"] as const,
    detail: (id: string) => 
      [...queryKeys.tasks.details(), id] as const,
    queue: (queueName: string) =>
      [...queryKeys.tasks.all, "queue", queueName] as const,
  },
  
  // 分析
  analysis: {
    all: ["analysis"] as const,
    statistics: (type: string, params: Record<string, any>) =>
      [...queryKeys.analysis.all, "statistics", type, params] as const,
    validation: (params: Record<string, any>) =>
      [...queryKeys.analysis.all, "validation", params] as const,
    queries: (params: Record<string, any>) =>
      [...queryKeys.analysis.all, "queries", params] as const,
  },
  
  // 系统
  system: {
    all: ["system"] as const,
    users: () => [...queryKeys.system.all, "users"] as const,
    roles: () => [...queryKeys.system.all, "roles"] as const,
    config: () => [...queryKeys.system.all, "config"] as const,
    audit: (filters: Record<string, any>) =>
      [...queryKeys.system.all, "audit", filters] as const,
  },
  
  // 伦理
  ethics: {
    all: ["ethics"] as const,
    applications: (filters: Record<string, any>) =>
      [...queryKeys.ethics.all, "applications", filters] as const,
    committees: () => [...queryKeys.ethics.all, "committees"] as const,
    approvals: (filters: Record<string, any>) =>
      [...queryKeys.ethics.all, "approvals", filters] as const,
  },
  
  // 法规
  regulatory: {
    all: ["regulatory"] as const,
    regulations: (filters: Record<string, any>) =>
      [...queryKeys.regulatory.all, "regulations", filters] as const,
    checks: (filters: Record<string, any>) =>
      [...queryKeys.regulatory.all, "checks", filters] as const,
    trainings: (filters: Record<string, any>) =>
      [...queryKeys.regulatory.all, "trainings", filters] as const,
  },
  
  // RWS
  rws: {
    all: ["rws"] as const,
    studies: (filters: Record<string, any>) =>
      [...queryKeys.rws.all, "studies", filters] as const,
    detail: (id: number | string) =>
      [...queryKeys.rws.all, "detail", id] as const,
  },
};

// ============ 查询默认选项 ============

/**
 * 创建标准查询选项
 */
export function createQueryOptions<TData, TError = Error>(
  options: Partial<UseQueryOptions<TData, TError>>
): UseQueryOptions<TData, TError> {
  return {
    staleTime: STALE_TIME.MEDIUM,
    gcTime: CACHE_TIME.MEDIUM,
    refetchOnWindowFocus: false,
    retry: 2,
    ...options,
  } as UseQueryOptions<TData, TError>;
}

/**
 * 预定义的查询配置
 */
export const queryPresets = {
  /** 列表查询（中等缓存）*/
  list: {
    staleTime: STALE_TIME.SHORT,
    gcTime: CACHE_TIME.MEDIUM,
    refetchOnWindowFocus: false,
  },
  
  /** 详情查询（较长缓存）*/
  detail: {
    staleTime: STALE_TIME.MEDIUM,
    gcTime: CACHE_TIME.LONG,
    refetchOnWindowFocus: false,
  },
  
  /** 静态数据（很长缓存）*/
  static: {
    staleTime: STALE_TIME.PERSISTENT,
    gcTime: CACHE_TIME.PERSISTENT,
    refetchOnWindowFocus: false,
  },
  
  /** 实时数据（不缓存）*/
  realtime: {
    staleTime: STALE_TIME.NONE,
    gcTime: CACHE_TIME.SHORT,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // 30秒自动刷新
  },
  
  /** 后台刷新（保持数据新鲜）*/
  background: {
    staleTime: STALE_TIME.SHORT,
    gcTime: CACHE_TIME.MEDIUM,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  },
};

// ============ 乐观更新工具 ============

interface OptimisticMutationOptions<TData, TVariables> {
  /** 获取旧数据的查询键 */
  queryKey: QueryKey;
  /** 生成乐观数据 */
  optimisticData: (variables: TVariables, oldData: TData | undefined) => TData;
  /** 实际的mutation函数 */
  mutationFn: MutationFunction<TData, TVariables>;
}

/**
 * 创建乐观更新mutation
 */
export function createOptimisticMutation<TData, TVariables>(
  queryClient: QueryClient,
  options: OptimisticMutationOptions<TData, TVariables>
): UseMutationOptions<TData, Error, TVariables, { previousData?: TData }> {
  return {
    mutationFn: options.mutationFn,
    
    onMutate: async (variables) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: options.queryKey });
      
      // 保存旧数据
      const previousData = queryClient.getQueryData<TData>(options.queryKey);
      
      // 乐观更新
      queryClient.setQueryData<TData>(
        options.queryKey,
        (old) => options.optimisticData(variables, old)
      );
      
      return { previousData };
    },
    
    onError: (_err, _variables, context: any) => {
      // 回滚到旧数据
      if (context?.previousData) {
        queryClient.setQueryData(options.queryKey, context.previousData);
      }
    },
    
    onSettled: () => {
      // 重新获取最新数据
      queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
  };
}

// ============ 批量失效工具 ============

/**
 * 批量失效相关查询
 */
export function invalidateRelatedQueries(
  queryClient: QueryClient,
  keys: QueryKey[]
) {
  return Promise.all(
    keys.map(key => queryClient.invalidateQueries({ queryKey: key }))
  );
}

/**
 * 失效所有列表查询
 */
export function invalidateAllLists(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key.includes("list");
    },
  });
}

// ============ 预取工具 ============

/**
 * 预取数据
 */
export function prefetchQuery<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options?: { staleTime?: number }
) {
  return queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: options?.staleTime ?? STALE_TIME.MEDIUM,
  });
}

/**
 * 悬停预取（用于链接等）
 */
export function usePrefetchOnHover<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<TData>
) {
  let prefetched = false;
  
  return {
    onMouseEnter: () => {
      if (!prefetched) {
        prefetchQuery(queryClient, queryKey, queryFn);
        prefetched = true;
      }
    },
  };
}

// ============ 离线支持 ============

/**
 * 检查是否在线
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * 配置离线支持的QueryClient
 */
export function createQueryClientWithOfflineSupport(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME.MEDIUM,
        gcTime: CACHE_TIME.LONG,
        refetchOnWindowFocus: false,
        networkMode: "offlineFirst",
        retry: (failureCount, _error) => {
          // 网络错误时重试
          if (!isOnline()) return false;
          return failureCount < 3;
        },
      },
      mutations: {
        networkMode: "offlineFirst",
        retry: 3,
      },
    },
  });
}

// ============ 导出默认QueryClient配置 ============

export function createOptimizedQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME.MEDIUM,
        gcTime: CACHE_TIME.MEDIUM,
        refetchOnWindowFocus: false,
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      mutations: {
        retry: 1,
      },
    },
  });
}

