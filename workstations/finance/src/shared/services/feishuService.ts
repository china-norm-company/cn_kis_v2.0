/**
 * 飞书消息服务
 * 职责：发送飞书消息通知
 */

import { getApiMode } from "@/shared/config/env";

// ============= 飞书配置 =============

interface FeishuConfig {
  app_id?: string;
  app_secret?: string;
  tenant_access_token?: string; // 如果已有token，可以直接使用
}

// 从环境变量读取配置
function getFeishuConfig(): FeishuConfig {
  return {
    app_id: import.meta.env.VITE_FEISHU_APP_ID,
    app_secret: import.meta.env.VITE_FEISHU_APP_SECRET,
    tenant_access_token: import.meta.env.VITE_FEISHU_TENANT_ACCESS_TOKEN,
  };
}

// ============= 飞书API类型 =============

interface FeishuMessageRequest {
  receive_id: string; // 接收人ID（用户open_id或union_id）
  receive_id_type: 'open_id' | 'union_id' | 'user_id' | 'email' | 'chat_id';
  msg_type: 'text' | 'rich_text' | 'post' | 'image' | 'file' | 'audio' | 'media' | 'sticker' | 'interactive' | 'share_chat' | 'share_user';
  content: string | Record<string, any>; // 消息内容
}

interface FeishuTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

// ============= 飞书API调用 =============

/**
 * 获取飞书API URL（开发环境使用代理，生产环境直接访问）
 */
function getFeishuApiUrl(path: string): string {
  // 移除开头的斜杠（如果有）
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  if (import.meta.env.DEV) {
    // 开发环境：使用Vite代理
    return `/feishu-api/${cleanPath}`;
  } else {
    // 生产环境：直接访问飞书API
    return `https://open.feishu.cn/${cleanPath}`;
  }
}

/**
 * 获取飞书应用访问令牌（tenant_access_token）
 */
async function getFeishuAccessToken(): Promise<string | null> {
  const config = getFeishuConfig();
  
  // 如果已有token，直接返回
  if (config.tenant_access_token) {
    console.log('[飞书服务] 使用配置的tenant_access_token');
    return config.tenant_access_token;
  }
  
  // 如果没有app_id和app_secret，无法获取token
  if (!config.app_id || !config.app_secret) {
    console.error('[飞书服务] ❌ 未配置飞书App ID或App Secret');
    console.error('[飞书服务] 请在.env.local中配置:');
    console.error('  VITE_FEISHU_APP_ID=your_app_id');
    console.error('  VITE_FEISHU_APP_SECRET=your_app_secret');
    return null;
  }
  
  try {
    console.log('[飞书服务] 正在获取飞书访问令牌...');
    // 使用代理路径避免CORS问题（开发环境）
    const apiUrl = import.meta.env.DEV 
      ? '/feishu-api/open-apis/auth/v3/tenant_access_token/internal'
      : 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: config.app_id,
        app_secret: config.app_secret,
      }),
    });
    
    const data: FeishuTokenResponse = await response.json();
    
    if (data.code === 0 && data.tenant_access_token) {
      console.log('[飞书服务] ✅ 访问令牌获取成功，有效期:', data.expire, '秒');
      return data.tenant_access_token;
    } else {
      console.error('[飞书服务] ❌ 获取访问令牌失败:', {
        code: data.code,
        msg: data.msg,
      });
      if (data.code === 99991663) {
        console.error('[飞书服务] 提示：请检查App ID和App Secret是否正确');
      }
      return null;
    }
  } catch (error) {
    console.error('[飞书服务] ❌ 获取访问令牌异常:', error);
    return null;
  }
}

/**
 * 根据用户名或邮箱查找飞书用户ID
 * 支持：邮箱、手机号、用户ID、姓名（通过部门用户列表匹配）
 */
async function findFeishuUserId(identifier: string, token: string, recipientType: 'name' | 'email' | 'user_id'): Promise<string | null> {
  try {
    // 如果已经是用户ID，直接返回
    if (recipientType === 'user_id' || identifier.startsWith('ou_')) {
      console.log(`[飞书服务] 使用用户ID: ${identifier}`);
      return identifier;
    }
    
    // 尝试通过邮箱查找
    if (recipientType === 'email' || identifier.includes('@')) {
      console.log(`[飞书服务] 通过邮箱查找用户: ${identifier}`);
      const emailResponse = await fetch(
        getFeishuApiUrl('open-apis/contact/v3/users/batch_get_id?user_id_type=open_id'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            emails: [identifier],
          }),
        }
      );
      
      const emailData = await emailResponse.json();
      if (emailData.code === 0 && emailData.data?.user_list?.length > 0) {
        const userId = emailData.data.user_list[0].user_id;
        console.log(`[飞书服务] ✅ 通过邮箱找到用户ID: ${userId}`);
        return userId;
      } else {
        const errorMsg = emailData.msg || '未知错误';
        console.warn(`[飞书服务] 通过邮箱未找到用户: ${errorMsg}`);
        
        // 检查是否是IP白名单错误
        if (errorMsg.includes('denied by app setting') || errorMsg.includes('ip')) {
          console.error('[飞书服务] ⚠️ IP白名单限制：当前IP不在飞书应用的IP白名单中');
          console.error('[飞书服务] 解决方案：');
          console.error('  1. 在飞书开放平台 -> 应用管理 -> 安全设置 -> IP白名单中，添加当前IP');
          console.error('  2. 或者通过后端服务器发送消息（后端服务器IP应在白名单中）');
          console.error('  3. 或者使用Mock模式进行测试（VITE_API_MODE=mock）');
          // 不抛出错误，让系统尝试其他方式（如后端API）
        }
      }
    }
    
    // 如果邮箱查找失败，尝试通过手机号查找
    if (/^1[3-9]\d{9}$/.test(identifier)) {
      console.log(`[飞书服务] 通过手机号查找用户: ${identifier}`);
      const phoneResponse = await fetch(
        getFeishuApiUrl('open-apis/contact/v3/users/batch_get_id?user_id_type=open_id'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            mobiles: [identifier],
          }),
        }
      );
      
      const phoneData = await phoneResponse.json();
      if (phoneData.code === 0 && phoneData.data?.user_list?.length > 0) {
        const userId = phoneData.data.user_list[0].user_id;
        console.log(`[飞书服务] ✅ 通过手机号找到用户ID: ${userId}`);
        return userId;
      } else {
        console.warn(`[飞书服务] 通过手机号未找到用户: ${phoneData.msg || '未知错误'}`);
      }
    }
    
    // 如果通过姓名查找（使用更高效的搜索API）
    if (recipientType === 'name' && !identifier.includes('@') && !/^1[3-9]\d{9}$/.test(identifier)) {
      console.log(`[飞书服务] 尝试通过姓名查找用户: ${identifier}`);
      try {
        // 方法1：使用搜索API（更高效）
        const searchResponse = await fetch(
          getFeishuApiUrl('open-apis/search/v2/data_source/user'),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              query: identifier,
              limit: 10,
            }),
          }
        );
        
        const searchData = await searchResponse.json();
        if (searchData.code === 0 && searchData.data?.items) {
          // 精确匹配姓名
          const exactMatch = searchData.data.items.find((item: any) => {
            const userName = item.title || item.name || '';
            return userName === identifier || userName.includes(identifier);
          });
          
          if (exactMatch && exactMatch.user_id) {
            console.log(`[飞书服务] ✅ 通过姓名搜索找到用户ID: ${exactMatch.user_id} (${exactMatch.title || exactMatch.name})`);
            return exactMatch.user_id;
          }
        }
        
        // 方法2：如果搜索API失败，使用部门用户列表（备用方案）
        console.log(`[飞书服务] 搜索API未找到，尝试通过部门列表查找...`);
        const deptResponse = await fetch(
          getFeishuApiUrl('open-apis/contact/v3/departments?fetch_child=true&page_size=100'),
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );
        
        const deptData = await deptResponse.json();
        if (deptData.code === 0 && deptData.data?.items) {
          console.log(`[飞书服务] 找到 ${deptData.data.items.length} 个部门，开始遍历查找用户...`);
          // 遍历部门，查找用户（限制最多查找前20个部门，避免超时）
          const maxDepts = Math.min(20, deptData.data.items.length);
          for (let i = 0; i < maxDepts; i++) {
            const dept = deptData.data.items[i];
            try {
              const usersResponse = await fetch(
                getFeishuApiUrl(`open-apis/contact/v3/users?department_id=${dept.department_id}&page_size=100`),
                {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                  },
                }
              );
              
              const usersData = await usersResponse.json();
              if (usersData.code === 0 && usersData.data?.items) {
                // 精确匹配姓名（完全匹配或包含）
                const matchedUser = usersData.data.items.find((user: any) => {
                  const name = user.name || '';
                  const enName = user.en_name || '';
                  // 完全匹配或包含匹配
                  return name === identifier || 
                         identifier === name || 
                         name.includes(identifier) || 
                         identifier.includes(name) ||
                         (enName && enName.toLowerCase() === identifier.toLowerCase());
                });
                
                if (matchedUser && matchedUser.open_id) {
                  console.log(`[飞书服务] ✅ 通过部门列表找到用户ID: ${matchedUser.open_id} (${matchedUser.name})`);
                  return matchedUser.open_id;
                }
              }
            } catch (error) {
              console.warn(`[飞书服务] 获取部门 ${dept.department_id} 的用户列表失败:`, error);
              continue; // 继续查找下一个部门
            }
          }
        }
        console.warn(`[飞书服务] ⚠️ 通过姓名未找到用户: ${identifier}`);
        console.warn(`[飞书服务] 提示：请使用邮箱地址或飞书用户ID，姓名查找可能不准确`);
      } catch (error) {
        console.error(`[飞书服务] ❌ 通过姓名查找用户异常:`, error);
      }
    }
    
    // 如果都查找失败，记录警告
    console.error(`[飞书服务] ❌ 无法找到用户: ${identifier} (类型: ${recipientType})`);
    console.error('[飞书服务] 提示：请使用邮箱地址、手机号或飞书用户ID作为接收人');
    return null;
  } catch (error) {
    console.error('[飞书服务] 查找用户ID异常:', error);
    return null;
  }
}

/**
 * 发送飞书文本消息
 */
async function sendFeishuTextMessage(
  userId: string,
  content: string,
  token: string
): Promise<boolean> {
  try {
    console.log('[飞书服务] 准备发送消息，参数:', {
      receive_id: userId,
      receive_id_type: 'open_id',
      msg_type: 'text',
      content_preview: content.substring(0, 50) + '...',
    });
    
    // 根据飞书官方文档，发送消息的API格式
    // 注意：content字段需要是JSON字符串，但text字段的值就是纯文本内容
    // 飞书API要求：content必须是JSON字符串，格式为 {"text": "消息内容"}
    const contentJson = {
      text: content,
    };
    
    const requestBody = {
      receive_id: userId,
      receive_id_type: 'open_id', // 使用open_id类型
      msg_type: 'text',
      content: JSON.stringify(contentJson), // content必须是JSON字符串
    };
    
    // 验证请求体格式
    if (!userId || !userId.startsWith('ou_')) {
      console.error('[飞书服务] ❌ 用户ID格式错误:', userId);
      console.error('[飞书服务] 提示：用户ID应该以 ou_ 开头');
      return false;
    }
    
    // 验证content格式
    try {
      const contentParsed = JSON.parse(requestBody.content);
      if (!contentParsed.text || typeof contentParsed.text !== 'string') {
        console.error('[飞书服务] ❌ content格式错误:', requestBody.content);
        return false;
      }
    } catch (e) {
      console.error('[飞书服务] ❌ content不是有效的JSON:', requestBody.content);
      return false;
    }
    
    console.log('[飞书服务] 请求体:', JSON.stringify(requestBody, null, 2));
    
    // 根据飞书官方文档，receive_id_type 应该作为查询参数，而不是请求体字段
    const apiUrl = `${getFeishuApiUrl('open-apis/im/v1/messages')}?receive_id_type=open_id`;
    console.log('[飞书服务] API URL:', apiUrl);
    
    // 从请求体中移除 receive_id_type，因为它已经在查询参数中了
    const { receive_id_type, ...bodyWithoutReceiveIdType } = requestBody;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(bodyWithoutReceiveIdType),
    });
    
    const responseText = await response.text();
    console.log('[飞书服务] 响应状态:', response.status);
    console.log('[飞书服务] 响应内容:', responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[飞书服务] 响应解析失败:', e);
      console.error('[飞书服务] 原始响应:', responseText);
      return false;
    }
    
    if (data.code === 0) {
      console.log('[飞书服务] ✅ 消息发送成功，消息ID:', data.data?.message_id);
      return true;
    } else {
      console.error('[飞书服务] ❌ 消息发送失败:', {
        code: data.code,
        msg: data.msg,
        error: data.error,
      });
      
      // 如果是参数验证错误，输出更详细的错误信息
      if (data.code === 1254000 || data.msg?.includes('validation')) {
        console.error('[飞书服务] 参数验证失败，请检查：');
        console.error('  - receive_id 是否正确');
        console.error('  - receive_id_type 是否为 open_id');
        console.error('  - content 格式是否正确（需要是JSON字符串）');
        console.error('  - 请求体:', JSON.stringify(requestBody, null, 2));
      }
      
      return false;
    }
  } catch (error) {
    console.error('[飞书服务] ❌ 发送消息异常:', error);
    return false;
  }
}

// ============= 公开API =============

/**
 * 发送飞书消息
 * @param recipient 接收人标识（用户名、邮箱或飞书用户ID）
 * @param content 消息内容
 * @param options 可选配置
 */
export async function sendFeishuMessage(
  recipient: string,
  content: string,
  options?: {
    recipientType?: 'name' | 'email' | 'user_id';
    messageType?: 'text' | 'rich_text';
  }
): Promise<boolean> {
  const apiMode = getApiMode();
  
  // 在Mock模式下，只记录日志，不实际发送
  if (apiMode !== 'real') {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 [Mock] 飞书消息（未实际发送）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`接收人：${recipient}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(content);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return true; // Mock模式下返回成功
  }
  
  try {
    // 1. 获取访问令牌
    const token = await getFeishuAccessToken();
    if (!token) {
      console.error('[飞书服务] 无法获取访问令牌，消息发送失败');
      return false;
    }
    
    // 2. 查找用户ID（自动识别类型）
    let recipientType: 'name' | 'email' | 'user_id' = 'name';
    if (recipient.includes('@')) {
      recipientType = 'email';
    } else if (recipient.startsWith('ou_')) {
      recipientType = 'user_id';
    } else {
      recipientType = options?.recipientType || 'name';
    }
    
    console.log(`[飞书服务] 查找用户: ${recipient} (类型: ${recipientType})`);
    const userId = await findFeishuUserId(recipient, token, recipientType);
    
    if (!userId) {
      console.error(`[飞书服务] ❌ 无法找到用户: ${recipient}`);
      console.error('[飞书服务] 提示：');
      console.error('  - 使用邮箱地址（推荐）：例如 zhangsan@company.com');
      console.error('  - 使用手机号：例如 13800138000');
      console.error('  - 使用飞书用户ID：例如 ou_xxxxxxxxxxxxx');
      console.error('  - 使用姓名：需要确保姓名在飞书组织架构中');
      return false;
    }
    
    // 3. 发送消息
    console.log(`[飞书服务] 准备发送消息给用户: ${userId}`);
    const success = await sendFeishuTextMessage(userId, content, token);
    
    if (success) {
      console.log(`[飞书服务] ✅ 消息发送成功`);
    } else {
      console.error(`[飞书服务] ❌ 消息发送失败`);
    }
    
    return success;
  } catch (error) {
    console.error('[飞书服务] 发送消息失败:', error);
    return false;
  }
}

/**
 * 发送飞书富文本消息（卡片消息）
 */
export async function sendFeishuCardMessage(
  recipient: string,
  title: string,
  content: string,
  options?: {
    recipientType?: 'name' | 'email' | 'user_id';
    buttons?: Array<{ text: string; url?: string; value?: string }>;
  }
): Promise<boolean> {
  const apiMode = getApiMode();
  
  // 在Mock模式下，只记录日志
  if (apiMode !== 'real') {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 [Mock] 飞书卡片消息（未实际发送）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`接收人：${recipient}`);
    console.log(`标题：${title}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(content);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return true;
  }
  
  try {
    const resp = await fetch('/api/v1/notification/send-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient,
        recipient_type: options?.recipientType || 'name',
        title,
        content,
        buttons: options?.buttons || [],
      }),
    });
    const data = await resp.json();
    return data.code === 200;
  } catch (err) {
    console.warn('[飞书服务] 卡片消息发送失败:', err);
    return false;
  }
}
