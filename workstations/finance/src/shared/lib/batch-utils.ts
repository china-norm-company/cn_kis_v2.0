/**
 * 批量操作与分块处理工具
 * 
 * 用于处理大数据集的上传、下载和批量操作
 * 
 * 特性：
 * - 分块上传大文件
 * - 批量请求合并
 * - 进度追踪
 * - 错误重试
 * - 并发控制
 */

import { apiClient } from "@/shared/api/client";

// ============ 类型定义 ============

interface ChunkUploadOptions {
  /** 分块大小（字节），默认1MB */
  chunkSize?: number;
  /** 最大并发数 */
  concurrency?: number;
  /** 进度回调 */
  onProgress?: (progress: UploadProgress) => void;
  /** 重试次数 */
  retries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
}

interface UploadProgress {
  /** 已上传字节数 */
  loaded: number;
  /** 总字节数 */
  total: number;
  /** 百分比 (0-100) */
  percent: number;
  /** 当前分块索引 */
  currentChunk: number;
  /** 总分块数 */
  totalChunks: number;
}

interface BatchRequestOptions<T, R> {
  /** 请求函数 */
  requestFn: (items: T[]) => Promise<R[]>;
  /** 批次大小 */
  batchSize?: number;
  /** 最大并发数 */
  concurrency?: number;
  /** 进度回调 */
  onProgress?: (completed: number, total: number) => void;
  /** 单批次完成回调 */
  onBatchComplete?: (results: R[], batchIndex: number) => void;
  /** 错误处理 */
  onError?: (error: Error, items: T[], batchIndex: number) => void;
  /** 是否在错误时继续 */
  continueOnError?: boolean;
}

interface RetryOptions {
  /** 重试次数 */
  retries: number;
  /** 重试延迟（毫秒） */
  delay: number;
  /** 延迟倍增因子 */
  backoffFactor?: number;
  /** 最大延迟 */
  maxDelay?: number;
  /** 判断是否应重试 */
  shouldRetry?: (error: Error) => boolean;
}

// ============ 分块上传 ============

/**
 * 分块上传大文件
 */
export async function uploadFileInChunks(
  file: File,
  uploadUrl: string,
  options: ChunkUploadOptions = {}
): Promise<{ fileId: string; url: string }> {
  const {
    chunkSize = 1024 * 1024, // 1MB
    concurrency = 3,
    onProgress,
    retries = 3,
    retryDelay = 1000,
  } = options;

  const totalChunks = Math.ceil(file.size / chunkSize);
  const uploadId = generateUploadId();
  let uploadedBytes = 0;

  // 创建分块列表
  const chunks: Array<{ index: number; start: number; end: number }> = [];
  for (let i = 0; i < totalChunks; i++) {
    chunks.push({
      index: i,
      start: i * chunkSize,
      end: Math.min((i + 1) * chunkSize, file.size),
    });
  }

  // 上传单个分块
  const uploadChunk = async (chunk: typeof chunks[0]): Promise<void> => {
    const blob = file.slice(chunk.start, chunk.end);
    const formData = new FormData();
    formData.append("chunk", blob);
    formData.append("uploadId", uploadId);
    formData.append("chunkIndex", String(chunk.index));
    formData.append("totalChunks", String(totalChunks));
    formData.append("fileName", file.name);
    formData.append("fileSize", String(file.size));

    await retryOperation(
      async () => {
        await apiClient.post(uploadUrl, formData);
      },
      { retries, delay: retryDelay }
    );

    uploadedBytes += chunk.end - chunk.start;
    
    onProgress?.({
      loaded: uploadedBytes,
      total: file.size,
      percent: Math.round((uploadedBytes / file.size) * 100),
      currentChunk: chunk.index + 1,
      totalChunks,
    });
  };

  // 并发上传
  await processConcurrently(chunks, uploadChunk, concurrency);

  // 完成上传
  const response = await apiClient.post<{ fileId: string; url: string }>(
    `${uploadUrl}/complete`,
    {
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      totalChunks,
    }
  );

  return response.data;
}

/**
 * 生成上传ID
 */
function generateUploadId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

// ============ 批量请求 ============

/**
 * 批量处理数据
 * 
 * 将大量数据分批处理，支持并发和进度追踪
 */
export async function processBatch<T, R>(
  items: T[],
  options: BatchRequestOptions<T, R>
): Promise<R[]> {
  const {
    requestFn,
    batchSize = 50,
    concurrency = 3,
    onProgress,
    onBatchComplete,
    onError,
    continueOnError = true,
  } = options;

  const results: R[] = [];
  const batches: T[][] = [];
  
  // 分批
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  let completedItems = 0;
  const totalItems = items.length;

  // 处理单个批次
  const processSingleBatch = async (batch: T[], batchIndex: number): Promise<R[]> => {
    try {
      const batchResults = await requestFn(batch);
      onBatchComplete?.(batchResults, batchIndex);
      
      completedItems += batch.length;
      onProgress?.(completedItems, totalItems);
      
      return batchResults;
    } catch (error) {
      onError?.(error as Error, batch, batchIndex);
      
      if (!continueOnError) {
        throw error;
      }
      
      return [];
    }
  };

  // 并发处理批次
  const batchResults = await processConcurrently(
    batches.map((batch, index) => ({ batch, index })),
    async ({ batch, index }) => processSingleBatch(batch, index),
    concurrency
  );

  // 合并结果
  for (const batchResult of batchResults) {
    results.push(...batchResult);
  }

  return results;
}

/**
 * 批量API请求
 */
export async function batchApiRequest<T, R>(
  items: T[],
  endpoint: string,
  options: Omit<BatchRequestOptions<T, R>, "requestFn"> = {}
): Promise<R[]> {
  return processBatch(items, {
    ...options,
    requestFn: async (batch) => {
      const response = await apiClient.post<R[]>(endpoint, { items: batch });
      return response.data;
    },
  });
}

// ============ 并发控制 ============

/**
 * 并发处理函数
 * 
 * 限制并发数量，避免请求过载
 */
export async function processConcurrently<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number = 3
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const processNext = async (): Promise<void> => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await processor(items[index], index);
    }
  };

  // 创建并发工作器
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => processNext()
  );

  await Promise.all(workers);
  return results;
}

/**
 * 限流处理器
 * 
 * 限制每秒请求数
 */
export function createRateLimiter(requestsPerSecond: number) {
  const minInterval = 1000 / requestsPerSecond;
  let lastRequestTime = 0;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < minInterval) {
      await sleep(minInterval - timeSinceLastRequest);
    }
    
    lastRequestTime = Date.now();
    return fn();
  };
}

// ============ 重试机制 ============

/**
 * 带重试的操作
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    retries,
    delay,
    backoffFactor = 2,
    maxDelay = 30000,
    shouldRetry = () => true,
  } = options;

  let lastError: Error;
  let currentDelay = delay;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === retries || !shouldRetry(lastError)) {
        throw lastError;
      }
      
      await sleep(currentDelay);
      currentDelay = Math.min(currentDelay * backoffFactor, maxDelay);
    }
  }

  throw lastError!;
}

// ============ 数据导出 ============

interface ExportOptions {
  /** 文件名 */
  fileName: string;
  /** 文件格式 */
  format: "csv" | "json" | "xlsx";
  /** 分块大小（用于大数据） */
  chunkSize?: number;
  /** 进度回调 */
  onProgress?: (percent: number) => void;
}

/**
 * 导出数据为文件
 */
export async function exportData<T extends Record<string, any>>(
  data: T[],
  options: ExportOptions
): Promise<void> {
  const { fileName, format, onProgress } = options;

  let content: string | Blob;

  switch (format) {
    case "csv":
      content = convertToCSV(data, onProgress);
      break;
    case "json":
      content = JSON.stringify(data, null, 2);
      break;
    case "xlsx":
      // 需要外部库支持，这里用CSV代替
      content = convertToCSV(data, onProgress);
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  // 创建下载
  const blob = typeof content === "string" ? new Blob([content], { type: getMimeType(format) }) : content;
  downloadBlob(blob, `${fileName}.${format}`);
}

/**
 * 转换为CSV格式
 */
function convertToCSV<T extends Record<string, any>>(
  data: T[],
  onProgress?: (percent: number) => void
): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const lines: string[] = [headers.join(",")];

  data.forEach((item, index) => {
    const values = headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "string" && (value.includes(",") || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    });
    lines.push(values.join(","));

    if (onProgress && index % 1000 === 0) {
      onProgress(Math.round((index / data.length) * 100));
    }
  });

  onProgress?.(100);
  return lines.join("\n");
}

/**
 * 获取MIME类型
 */
function getMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    csv: "text/csv;charset=utf-8",
    json: "application/json",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimeTypes[format] || "application/octet-stream";
}

/**
 * 下载Blob
 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============ 数据导入 ============

interface ImportOptions {
  /** 进度回调 */
  onProgress?: (percent: number) => void;
  /** 验证函数 */
  validate?: (row: Record<string, any>) => boolean;
  /** 转换函数 */
  transform?: (row: Record<string, any>) => Record<string, any>;
}

/**
 * 从CSV导入数据
 */
export async function importFromCSV(
  file: File,
  options: ImportOptions = {}
): Promise<Record<string, any>[]> {
  const { onProgress, validate, transform } = options;
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter(line => line.trim());
        
        if (lines.length === 0) {
          resolve([]);
          return;
        }

        const headers = parseCSVLine(lines[0]);
        const results: Record<string, any>[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const row: Record<string, any> = {};
          
          headers.forEach((header, index) => {
            row[header] = values[index] || "";
          });

          // 验证
          if (validate && !validate(row)) {
            continue;
          }

          // 转换
          const finalRow = transform ? transform(row) : row;
          results.push(finalRow);

          if (onProgress && i % 100 === 0) {
            onProgress(Math.round((i / lines.length) * 100));
          }
        }

        onProgress?.(100);
        resolve(results);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/**
 * 解析CSV行
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// ============ 工具函数 ============

/**
 * 延迟
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 分块数组
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * 去重
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter(item => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 分组
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key]);
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

