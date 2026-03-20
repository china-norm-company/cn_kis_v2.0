/**
 * 文件存储服务（Mock模式）
 * 职责：在Mock模式下，将文件存储在IndexedDB或localStorage中
 * 真实模式：优先调用后端 /finance/invoices/upload-file 和 /finance/invoices/files/{fileId}
 */

import { apiClient } from "@/shared/api/client";
import { getApiBaseUrl } from "@/shared/config/env";
import { getApiMode } from "@/shared/config/env";

const FILE_STORAGE_KEY = "mock_finance_files_v1";

interface StoredFile {
  id: string;
  invoice_id: number;
  file_name: string;
  file_type: string;
  file_data: string; // Base64编码的文件数据（用于localStorage）
  uploaded_at: string;
  download_count: number;
  blob?: Blob; // IndexedDB存储的Blob对象
}

// ============= IndexedDB 存储（推荐，支持大文件） =============

/**
 * 使用IndexedDB存储文件（支持大文件）
 */
async function saveFileToIndexedDB(
  invoiceId: number,
  file: File
): Promise<string> {
  // 先读取文件为ArrayBuffer（在事务外）
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as ArrayBuffer;
      if (result) {
        resolve(result);
      } else {
        reject(new Error("文件读取失败：结果为空"));
      }
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsArrayBuffer(file);
  });
  
  console.log('[文件存储] 文件读取完成，大小:', arrayBuffer.byteLength, '字节');
  
  // 然后在事务中保存
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("FinanceFilesDB", 1);
    
    request.onerror = () => {
      console.error('[文件存储] 无法打开IndexedDB:', request.error);
      reject(new Error("无法打开IndexedDB: " + (request.error?.message || "未知错误")));
    };
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["files"], "readwrite");
      const store = transaction.objectStore("files");
      
      const fileId = `file_${invoiceId}_${Date.now()}`;
      // 直接使用ArrayBuffer创建Blob，确保类型正确
      const blob = new Blob([arrayBuffer], { type: file.type });
      
      console.log('[文件存储] 准备保存文件到IndexedDB:', {
        fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: blob.size,
        blobType: blob.type,
      });
      
      // 存储到IndexedDB - 直接存储Blob对象（IndexedDB支持）
      const fileData = {
        id: fileId,
        invoice_id: invoiceId,
        file_name: file.name,
        file_type: file.type,
        file_data: "", // 不使用Base64，直接存储Blob
        uploaded_at: new Date().toISOString(),
        download_count: 0,
        blob: blob, // IndexedDB可以直接存储Blob对象
      };
      
      // 存储到IndexedDB
      const putRequest = store.put(fileData);
      putRequest.onsuccess = () => {
        console.log('[文件存储] ✅ IndexedDB put操作成功，文件ID:', fileId, '文件大小:', blob.size, '字节');
        // 等待事务完成后再resolve，确保数据已持久化
      };
      putRequest.onerror = () => {
        console.error('[文件存储] ❌ IndexedDB保存失败:', putRequest.error);
        reject(new Error("文件存储失败: " + (putRequest.error?.message || "未知错误")));
      };
      
      transaction.onerror = () => {
        console.error('[文件存储] ❌ IndexedDB事务失败:', transaction.error);
        reject(new Error("事务失败: " + (transaction.error?.message || "未知错误")));
      };
      
      transaction.oncomplete = () => {
        console.log('[文件存储] ✅ IndexedDB事务完成，文件ID:', fileId, '已持久化');
        resolve(fileId);
      };
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("files")) {
        const objectStore = db.createObjectStore("files", { keyPath: "id" });
        objectStore.createIndex("invoice_id", "invoice_id", { unique: false });
        console.log('[文件存储] ✅ IndexedDB对象存储已创建');
      }
    };
  });
}

/**
 * 从IndexedDB获取文件
 */
async function getFileFromIndexedDB(fileId: string): Promise<Blob | null> {
  console.log('[文件存储] 从IndexedDB获取文件，文件ID:', fileId);
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("FinanceFilesDB", 1);
    
    request.onerror = () => {
      console.error('[文件存储] ❌ 无法打开IndexedDB:', request.error);
      reject(new Error("无法打开IndexedDB: " + (request.error?.message || "未知错误")));
    };
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["files"], "readonly");
      const store = transaction.objectStore("files");
      
      console.log('[文件存储] 准备查询文件，文件ID:', fileId);
      const getRequest = store.get(fileId);
      
      getRequest.onsuccess = () => {
        const fileData = getRequest.result;
        console.log('[文件存储] 查询结果:', {
          fileId,
          hasData: !!fileData,
          hasBlob: !!(fileData && fileData.blob),
          dataKeys: fileData ? Object.keys(fileData) : [],
          blobType: fileData?.blob ? typeof fileData.blob : 'N/A',
          blobSize: fileData?.blob ? (fileData.blob.size || 'N/A') : 'N/A',
        });
        
        if (fileData && fileData.blob) {
          // 确保返回的是Blob对象
          let blob: Blob;
          if (fileData.blob instanceof Blob) {
            blob = fileData.blob;
          } else {
            // 如果不是Blob对象，尝试从ArrayBuffer重建
            console.warn('[文件存储] ⚠️ blob字段不是Blob对象，尝试转换');
            if (fileData.blob instanceof ArrayBuffer) {
              blob = new Blob([fileData.blob], { type: fileData.file_type || 'application/octet-stream' });
            } else {
              console.error('[文件存储] ❌ blob字段格式不正确:', typeof fileData.blob);
              resolve(null);
              return;
            }
          }
          
          console.log('[文件存储] ✅ 找到文件，大小:', blob.size, '字节，类型:', blob.type);
          resolve(blob);
        } else {
          console.warn('[文件存储] ⚠️ 文件数据不存在或没有blob字段');
          
          // 尝试列出所有文件，用于调试
          const getAllRequest = store.getAll();
          getAllRequest.onsuccess = () => {
            const allFiles = getAllRequest.result;
            console.log('[文件存储] IndexedDB中的所有文件:', allFiles.map((f: any) => ({
              id: f.id,
              invoice_id: f.invoice_id,
              file_name: f.file_name,
              has_blob: !!f.blob,
              blob_type: f.blob ? typeof f.blob : 'N/A',
            })));
            
            // 检查是否有匹配的文件ID
            const matchingFiles = allFiles.filter((f: any) => {
              const idMatch = f.id === fileId;
              return idMatch;
            });
            console.log('[文件存储] 查找的文件ID:', fileId);
            console.log('[文件存储] 匹配的文件数量:', matchingFiles.length);
            
            // 如果没有精确匹配，尝试通过invoice_id查找
            if (matchingFiles.length === 0) {
              const invoiceIdMatch = fileId.match(/^file_(\d+)_/);
              if (invoiceIdMatch) {
                const invoiceId = parseInt(invoiceIdMatch[1]);
                const invoiceFiles = allFiles.filter((f: any) => f.invoice_id === invoiceId);
                console.log('[文件存储] 通过invoice_id查找:', invoiceId, '找到', invoiceFiles.length, '个文件');
                if (invoiceFiles.length > 0) {
                  console.log('[文件存储] 建议使用最新的文件ID:', invoiceFiles[invoiceFiles.length - 1].id);
                }
              }
            }
          };
          
          resolve(null);
        }
      };
      
      getRequest.onerror = () => {
        console.error('[文件存储] ❌ 查询文件失败:', getRequest.error);
        reject(new Error("文件获取失败: " + (getRequest.error?.message || "未知错误")));
      };
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("files")) {
        const objectStore = db.createObjectStore("files", { keyPath: "id" });
        objectStore.createIndex("invoice_id", "invoice_id", { unique: false });
        console.log('[文件存储] ✅ IndexedDB对象存储已创建（在读取时）');
      }
    };
  });
}

// ============= localStorage 存储（备用，小文件） =============

/**
 * 使用localStorage存储文件（小文件，Base64编码）
 */
function saveFileToLocalStorage(
  invoiceId: number,
  file: File
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 5 * 1024 * 1024) {
      // 文件大于5MB，使用IndexedDB
      saveFileToIndexedDB(invoiceId, file).then(resolve).catch(reject);
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => {
      const fileId = `file_${invoiceId}_${Date.now()}`;
      const fileData: StoredFile = {
        id: fileId,
        invoice_id: invoiceId,
        file_name: file.name,
        file_type: file.type,
        file_data: reader.result as string, // Base64编码
        uploaded_at: new Date().toISOString(),
        download_count: 0,
      };
      
      try {
        const stored = JSON.parse(
          localStorage.getItem(FILE_STORAGE_KEY) || "[]"
        ) as StoredFile[];
        stored.push(fileData);
        localStorage.setItem(FILE_STORAGE_KEY, JSON.stringify(stored));
        resolve(fileId);
      } catch (error) {
        reject(new Error("文件存储失败"));
      }
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file); // 转换为Base64
  });
}

/**
 * 从localStorage获取文件
 */
function getFileFromLocalStorage(fileId: string): Blob | null {
  try {
    const stored = JSON.parse(
      localStorage.getItem(FILE_STORAGE_KEY) || "[]"
    ) as StoredFile[];
    const fileData = stored.find((f) => f.id === fileId);
    
    if (!fileData) return null;
    
    // 将Base64转换为Blob
    const base64Data = fileData.file_data.split(",")[1]; // 移除data:type;base64,前缀
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: fileData.file_type });
  } catch (error) {
    console.error("获取文件失败:", error);
    return null;
  }
}

// ============= 统一API =============

/**
 * 保存文件（Mock模式）
 */
export async function saveInvoiceFile(
  invoiceId: number,
  file: File
): Promise<string> {
  const apiMode = getApiMode();
  
  // 无论是real还是mock模式，都先保存到本地存储
  // 这样可以确保文件能够正常下载（即使后端还没实现文件上传）
  // 如果后端实现了文件上传，可以在这里先调用后端API，失败时再fallback到本地存储
  
  if (apiMode === "real") {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("invoice_id", String(invoiceId));
      const res = await apiClient.post<{ file_id: string } | { code: number; data: { file_id: string } }>(
        "/finance/invoices/upload-file",
        formData
      );
      const payload = res.data;
      const fileId =
        payload && typeof payload === "object" && "data" in (payload as object) && (payload as { code?: number }).code === 200
          ? (payload as { data: { file_id: string } }).data.file_id
          : (payload as { file_id?: string })?.file_id;
      if (fileId) {
        return fileId;
      }
    } catch (error) {
      console.warn("后端文件上传失败，使用本地存储:", error);
    }
  }
  
  // 本地存储：优先使用IndexedDB，失败则使用localStorage
  try {
    console.log('[文件存储] 使用IndexedDB保存文件');
    return await saveFileToIndexedDB(invoiceId, file);
  } catch (error) {
    console.warn("[文件存储] IndexedDB存储失败，使用localStorage:", error);
    return await saveFileToLocalStorage(invoiceId, file);
  }
}

/**
 * 通过invoice_id查找文件（备用方法）
 */
async function getFileByInvoiceId(invoiceId: number): Promise<Blob | null> {
  console.log('[文件存储] 通过invoice_id查找文件，invoice_id:', invoiceId);
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("FinanceFilesDB", 1);
    
    request.onerror = () => {
      console.error('[文件存储] ❌ 无法打开IndexedDB:', request.error);
      reject(new Error("无法打开IndexedDB: " + (request.error?.message || "未知错误")));
    };
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["files"], "readonly");
      const store = transaction.objectStore("files");
      const index = store.index("invoice_id");
      
      const getRequest = index.getAll(invoiceId);
      
      getRequest.onsuccess = () => {
        const files = getRequest.result;
        console.log('[文件存储] 通过invoice_id找到', files.length, '个文件');
        
        if (files.length > 0) {
          // 使用最新的文件（按ID排序，取最后一个）
          const latestFile = files.sort((a: any, b: any) => {
            // 按时间戳排序
            const aTime = parseInt(a.id.split('_')[2] || '0');
            const bTime = parseInt(b.id.split('_')[2] || '0');
            return aTime - bTime;
          })[files.length - 1];
          
          if (latestFile && latestFile.blob) {
            let blob: Blob;
            if (latestFile.blob instanceof Blob) {
              blob = latestFile.blob;
            } else if (latestFile.blob instanceof ArrayBuffer) {
              blob = new Blob([latestFile.blob], { type: latestFile.file_type || 'application/octet-stream' });
            } else {
              console.error('[文件存储] ❌ blob字段格式不正确');
              resolve(null);
              return;
            }
            
            console.log('[文件存储] ✅ 通过invoice_id找到文件，ID:', latestFile.id, '大小:', blob.size, '字节');
            resolve(blob);
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      
      getRequest.onerror = () => {
        console.error('[文件存储] ❌ 通过invoice_id查询失败:', getRequest.error);
        resolve(null);
      };
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("files")) {
        const objectStore = db.createObjectStore("files", { keyPath: "id" });
        objectStore.createIndex("invoice_id", "invoice_id", { unique: false });
        console.log('[文件存储] ✅ IndexedDB对象存储已创建（在通过invoice_id查找时）');
      }
    };
  });
}

/**
 * 从后端获取文件 Blob（需独立 fetch，因 apiClient 解析 JSON）
 */
async function fetchInvoiceFileBlob(fileId: string): Promise<Blob | null> {
  const baseUrl = getApiBaseUrl();
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${normalizedBase}/finance/invoices/files/${encodeURIComponent(fileId)}`;
  const token = localStorage.getItem("admin_token");
  const headers: Record<string, string> = { Accept: "application/octet-stream,*/*" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  return res.blob();
}

/**
 * 获取文件（Mock模式）
 */
export async function getInvoiceFile(fileId: string): Promise<Blob | null> {
  const apiMode = getApiMode();

  if (apiMode === "real") {
    try {
      const blob = await fetchInvoiceFileBlob(fileId);
      if (blob) return blob;
    } catch (error) {
      console.warn("后端文件下载失败，尝试本地存储:", error);
    }
  }
  
  // Mock模式：优先从IndexedDB获取，失败则从localStorage获取
  try {
    const blob = await getFileFromIndexedDB(fileId);
    if (blob) return blob;
    
    // 如果通过文件ID找不到，尝试通过invoice_id查找（备用方法）
    const invoiceIdMatch = fileId.match(/^file_(\d+)_/);
    if (invoiceIdMatch) {
      const invoiceId = parseInt(invoiceIdMatch[1]);
      console.log('[文件存储] 文件ID查找失败，尝试通过invoice_id查找:', invoiceId);
      const blobByInvoiceId = await getFileByInvoiceId(invoiceId);
      if (blobByInvoiceId) {
        console.log('[文件存储] ✅ 通过invoice_id成功找到文件');
        return blobByInvoiceId;
      }
    }
  } catch (error) {
    console.warn("从IndexedDB获取文件失败，尝试localStorage:", error);
  }
  
  return getFileFromLocalStorage(fileId);
}

/**
 * 生成文件下载URL（临时URL，用于下载）
 */
export async function getInvoiceFileDownloadUrl(fileId: string): Promise<string | null> {
  const blob = await getInvoiceFile(fileId);
  if (!blob) return null;
  
  return URL.createObjectURL(blob);
}

/**
 * 下载文件
 * 支持文件ID和Blob URL两种格式
 */
export async function downloadInvoiceFile(
  fileId: string,
  fileName: string
): Promise<void> {
  console.log('[文件下载] 开始下载文件:', { fileId, fileName });
  
  // 检查是否是Blob URL（兼容旧数据）
  if (fileId.startsWith('blob:')) {
    console.warn('[文件下载] ⚠️ 检测到Blob URL，这是临时URL，可能已失效:', fileId);
    
    // 尝试直接使用Blob URL下载
    try {
      const response = await fetch(fileId);
      if (!response.ok) {
        throw new Error('Blob URL已失效，文件无法下载');
      }
      const blob = await response.blob();
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      
      console.log('[文件下载] ✅ 从Blob URL下载完成');
      return;
    } catch (error) {
      console.error('[文件下载] ❌ Blob URL下载失败:', error);
      throw new Error('电子发票文件已失效（Blob URL过期）。请重新上传电子发票文件。');
    }
  }
  
  // 正常文件ID下载
  console.log('[文件下载] 尝试从存储获取文件，文件ID:', fileId);
  const blob = await getInvoiceFile(fileId);
  if (!blob) {
    console.error('[文件下载] ❌ 文件不存在:', fileId);
    
    // 尝试列出所有文件，帮助调试
    try {
      const request = indexedDB.open("FinanceFilesDB", 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(["files"], "readonly");
        const store = transaction.objectStore("files");
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => {
          const allFiles = getAllRequest.result;
          console.log('[文件下载] IndexedDB中的所有文件:', allFiles.map((f: any) => ({
            id: f.id,
            invoice_id: f.invoice_id,
            file_name: f.file_name,
            has_blob: !!f.blob,
          })));
        };
      };
    } catch (e) {
      console.warn('[文件下载] 无法列出IndexedDB文件:', e);
    }
    
    throw new Error(`文件不存在（文件ID: ${fileId}）。请检查文件是否已正确保存。如果文件是新上传的，请刷新页面后重试。`);
  }
  
  console.log('[文件下载] ✅ 文件获取成功，大小:', blob.size, '字节，类型:', blob.type);
  
  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  
  // 触发下载
  link.click();
  
  // 延迟清理，确保下载开始
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log('[文件下载] ✅ 下载完成，文件名:', fileName);
  }, 100);
  
  // 更新下载次数（Mock模式 - 仅localStorage）
  try {
    const stored = JSON.parse(
      localStorage.getItem(FILE_STORAGE_KEY) || "[]"
    ) as StoredFile[];
    const fileData = stored.find((f) => f.id === fileId);
    if (fileData) {
      fileData.download_count = (fileData.download_count || 0) + 1;
      localStorage.setItem(FILE_STORAGE_KEY, JSON.stringify(stored));
      console.log('[文件下载] 下载次数已更新:', fileData.download_count);
    }
  } catch (error) {
    console.warn("[文件下载] 更新下载次数失败:", error);
  }
}
