// ============ 配置区域 ============
// 环境变量配置（在 Cloudflare Workers 中设置）:
// - SUPABASE_URL, SUPABASE_KEY: 数据库连接
// - ADMIN_PASSWORD: 管理面板密码
// - UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN: Redis 缓存（推荐，高并发必选）
// - CONFIG_KV: Cloudflare KV（可选备用）

// 构建时间（部署时更新此值，或使用 CI/CD 自动替换）
const BUILD_TIME = '2025-12-02T07:30:00Z' // __BUILD_TIME__

// 本地配置（如果没有数据库，使用此配置作为 fallback）
const FALLBACK_CONFIG = {}

// 缓存配置
const CONFIG_CACHE_TTL_MS = 10 * 60 * 1000 // 10 分钟（内存缓存）
const REDIS_CACHE_TTL_SECONDS = 5 * 60 // 5 分钟（Redis 缓存）
const KV_CACHE_TTL_SECONDS = 5 * 60 // 5 分钟（KV 缓存，备用）
const CACHE_KEY = 'anyrouter:api_configs'
let configCache = { value: null, expiresAt: 0 }

// ============ Redis 操作 ============

/**
 * Upstash Redis REST API 客户端
 * 使用 HTTP REST API，无需 TCP 连接，适合 Serverless
 */
class RedisClient {
  constructor(url, token) {
    this.baseUrl = url
    this.token = token
  }

  async request(command) {
    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    })
    const data = await response.json()
    if (data.error) throw new Error(data.error)
    return data.result
  }

  async get(key) {
    return this.request(['GET', key])
  }

  async set(key, value, ttlSeconds) {
    if (ttlSeconds) {
      return this.request(['SET', key, value, 'EX', ttlSeconds])
    }
    return this.request(['SET', key, value])
  }

  async del(key) {
    return this.request(['DEL', key])
  }
}

/**
 * 获取 Redis 客户端实例
 */
function getRedisClient(env) {
  if (!env.UPSTASH_REDIS_URL || !env.UPSTASH_REDIS_TOKEN) {
    return null
  }
  return new RedisClient(env.UPSTASH_REDIS_URL, env.UPSTASH_REDIS_TOKEN)
}

/**
 * 获取缓存的配置
 * @returns {Record<string, any>|null} 缓存的配置或 null（已过期）
 */
function getCachedConfig() {
  if (configCache.value && configCache.expiresAt > Date.now()) {
    return configCache.value;
  }
  return null;
}

/**
 * 写入配置缓存
 * @param {Record<string, any>} config 配置对象
 */
function setConfigCache(config) {
  configCache = {
    value: config,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  };
}

/**
 * 使内存缓存失效
 */
function invalidateConfigCache() {
  configCache = { value: null, expiresAt: 0 }
}

/**
 * 使所有缓存失效（内存 + Redis + KV）
 * @param {object} env - 环境变量
 */
async function invalidateAllCache(env) {
  configCache = { value: null, expiresAt: 0 }

  // 清除 Redis 缓存
  const redis = getRedisClient(env)
  if (redis) {
    try {
      await redis.del(CACHE_KEY)
    } catch {
      // 忽略错误
    }
  }

  // 清除 KV 缓存（备用）
  if (env && env.CONFIG_KV) {
    try {
      await env.CONFIG_KV.delete(CACHE_KEY)
    } catch {
      // 忽略错误
    }
  }
}

// ============ 数据库操作 ============

/**
 * 从 Supabase 获取配置（支持多级缓存）
 * 缓存优先级：内存(10min) -> Redis(5min) -> KV(5min,备用) -> 数据库
 */
async function getConfigFromDB(env) {
  // 1. 优先返回内存缓存（最快，~0ms）
  const memoryCached = getCachedConfig()
  if (memoryCached) {
    return memoryCached
  }

  // 2. 尝试从 Redis 缓存获取（推荐，~5-20ms）
  const redis = getRedisClient(env)
  if (redis) {
    try {
      const redisCached = await redis.get(CACHE_KEY)
      if (redisCached) {
        const parsed = JSON.parse(redisCached)
        setConfigCache(parsed)
        return parsed
      }
    } catch {
      // Redis 读取失败，继续
    }
  }

  // 3. 尝试从 KV 缓存获取（备用，~1-5ms）
  if (env.CONFIG_KV) {
    try {
      const kvCached = await env.CONFIG_KV.get(CACHE_KEY, { type: 'json' })
      if (kvCached) {
        setConfigCache(kvCached)
        return kvCached
      }
    } catch {
      // KV 读取失败，继续
    }
  }

  // 4. 无数据库配置时返回 fallback
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    setConfigCache(FALLBACK_CONFIG)
    return FALLBACK_CONFIG
  }

  // 5. 从数据库查询（最慢，~50-200ms）
  try {
    // 先尝试带软删除过滤的查询
    let response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?select=*&deleted_at=is.null&order=created_at.desc`,
      {
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
        },
      },
    )

    // 如果查询失败（可能是 deleted_at 列不存在），回退到不带过滤的查询
    if (!response.ok) {
      response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/api_configs?select=*&order=created_at.desc`,
        {
          headers: {
            apikey: env.SUPABASE_KEY,
            Authorization: `Bearer ${env.SUPABASE_KEY}`,
          },
        },
      )
    }

    if (!response.ok) {
      setConfigCache(FALLBACK_CONFIG)
      return FALLBACK_CONFIG
    }

    const data = await response.json()
    const config = {}

    data.forEach((item) => {
      if (!config[item.api_url]) {
        config[item.api_url] = { keys: [] }
      }
      config[item.api_url].keys.push({
        id: item.id,
        key_id: item.key_id,
        token: item.token,
        enabled: item.enabled,
        remark: item.remark || '',
        created_at: item.created_at,
        updated_at: item.updated_at,
      })
    })

    const finalizedConfig = Object.keys(config).length > 0 ? config : FALLBACK_CONFIG

    // 写入内存缓存
    setConfigCache(finalizedConfig)

    // 写入 Redis 缓存（异步，不阻塞响应）
    if (redis) {
      redis.set(CACHE_KEY, JSON.stringify(finalizedConfig), REDIS_CACHE_TTL_SECONDS)
        .catch(() => {})
    }

    // 写入 KV 缓存（备用，异步）
    if (env.CONFIG_KV) {
      env.CONFIG_KV.put(CACHE_KEY, JSON.stringify(finalizedConfig), {
        expirationTtl: KV_CACHE_TTL_SECONDS,
      }).catch(() => {})
    }

    return finalizedConfig
  } catch {
    setConfigCache(FALLBACK_CONFIG)
    return FALLBACK_CONFIG
  }
}

/**
 * 保存配置到数据库
 */
async function saveConfigToDB(env, apiUrl, token, enabled, remark = '') {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: "Database not configured" };
  }

  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/api_configs`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        api_url: apiUrl,
        token: token,
        enabled: enabled,
        remark: remark || null,
      }),
    });

    if (!response.ok) {
      return { success: false, error: await response.text() };
    }

    invalidateConfigCache();
    return { success: true, data: await response.json() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 更新配置
 */
async function updateConfigInDB(env, id, updates) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: "Database not configured" };
  }

  try {
    // 添加更新时间
    const data = { ...updates, updated_at: new Date().toISOString() };

    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      return { success: false, error: await response.text() };
    }

    invalidateConfigCache();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 软删除配置（设置 deleted_at 而非物理删除）
 */
async function deleteConfigFromDB(env, id) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: "Database not configured" };
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deleted_at: new Date().toISOString(),
        }),
      }
    );

    if (!response.ok) {
      return { success: false, error: await response.text() };
    }

    invalidateConfigCache();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 从指定 URL 的配置中随机选择一个启用的 key
 */
function getRandomEnabledKey(config, apiUrl) {
  const apiConfig = config[apiUrl];
  if (!apiConfig || !apiConfig.keys) {
    return null;
  }

  // 过滤出所有启用的 keys
  const enabledKeys = apiConfig.keys.filter((key) => key.enabled);

  if (enabledKeys.length === 0) {
    return null;
  }

  // 随机选择一个启用的 key
  const randomIndex = Math.floor(Math.random() * enabledKeys.length);
  return enabledKeys[randomIndex].token;
}

// 默认管理员密码
const DEFAULT_ADMIN_PASSWORD = "123456";

/**
 * 获取管理员密码（优先使用环境变量，否则使用默认值）
 */
function getAdminPassword(env) {
  return env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}

/**
 * 验证管理员密码
 */
function verifyAdmin(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.substring(7).trim();
  return token === getAdminPassword(env).trim();
}

/**
 * 校验 URL 是否有效
 * @param {string} apiUrl
 * @returns {boolean}
 */
function isValidUrl(apiUrl) {
  if (typeof apiUrl !== "string" || apiUrl.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(apiUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

/**
 * 校验 token 是否符合要求
 * @param {string} token
 * @returns {boolean}
 */
function isValidToken(token) {
  // 允许字母、数字、常见特殊字符（_-./=+ 等），排除空格和危险字符
  return (
    typeof token === "string" &&
    token.length > 0 &&
    token.length <= 1000 &&
    !/[\s\0\n\r]/.test(token)
  );
}

/**
 * 校验配置请求体
 * @param {any} body
 * @param {{ partial?: boolean }} [options]
 * @returns {{ valid: boolean, error?: string }}
 */
function validateConfigPayload(body, options = {}) {
  const { partial = false } = options;

  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid payload" };
  }

  if (!partial || "api_url" in body) {
    if (!isValidUrl(body.api_url)) {
      return { valid: false, error: "api_url is required and must be a valid URL" };
    }
  }

  if (!partial || "token" in body) {
    if (!isValidToken(body.token)) {
      return { valid: false, error: "token is required and must not contain special characters" };
    }
  }

  if ("enabled" in body && typeof body.enabled !== "boolean") {
    return { valid: false, error: "enabled must be a boolean" };
  }

  if ("remark" in body) {
    if (body.remark !== null && typeof body.remark !== "string") {
      return { valid: false, error: "remark must be a string or null" };
    }
    if (body.remark && body.remark.length > 255) {
      return { valid: false, error: "remark must be 255 characters or less" };
    }
  }

  if (partial && !("api_url" in body || "token" in body || "enabled" in body || "remark" in body)) {
    return { valid: false, error: "No fields provided for update" };
  }

  return { valid: true };
}

/**
 * 判断配置中是否存在启用的 key
 * @param {Record<string, any>} config
 * @param {string} [apiUrl]
 * @returns {boolean}
 */
function hasEnabledKey(config, apiUrl) {
  if (!config || Object.keys(config).length === 0) {
    return false;
  }

  if (apiUrl) {
    const apiConfig = config[apiUrl];
    return Boolean(apiConfig && apiConfig.keys && apiConfig.keys.some((key) => key.enabled));
  }

  return Object.values(config).some(
    (item) => item.keys && item.keys.some((key) => key.enabled)
  );
}

// ============ 主处理函数 ============

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);

  // 处理 CORS 预检请求
  if (request.method === "OPTIONS") {
    return handleCORS();
  }

  // 管理页面路由
  if (url.pathname === "/admin") {
    return new Response(getAdminHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // API 文档页面（需登录）
  if (url.pathname === "/docs") {
    return new Response(getDocsHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // API 路由
  if (url.pathname.startsWith("/api/")) {
    return handleApiRequest(request, env, url);
  }

  // 根路径返回状态页面
  if (request.method === "GET" && url.pathname === "/") {
    return new Response(getStatusHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 代理请求处理
  return handleProxyRequest(request, env, url);
}

/**
 * 处理 API 请求
 */
async function handleApiRequest(request, env, url) {
  // 验证管理员权限
  if (!verifyAdmin(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const path = url.pathname;

  // GET /api/configs - 获取所有配置
  if (path === "/api/configs" && request.method === "GET") {
    const config = await getConfigFromDB(env);
    return jsonResponse({ success: true, data: config });
  }

  // POST /api/configs - 添加新配置
  if (path === "/api/configs" && request.method === "POST") {
    const body = await request.json();
    const validation = validateConfigPayload(body);
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400);
    }
    const result = await saveConfigToDB(
      env,
      body.api_url,
      body.token,
      body.enabled ?? true,
      body.remark || ''
    );
    return jsonResponse(result, result.success ? 200 : 400);
  }

  // PATCH /api/configs/:id - 更新配置
  if (path.match(/^\/api\/configs\/\d+$/) && request.method === "PATCH") {
    const id = path.split("/").pop();
    const body = await request.json();
    const validation = validateConfigPayload(body, { partial: true });
    if (!validation.valid) {
      return jsonResponse({ error: validation.error }, 400);
    }
    const result = await updateConfigInDB(env, id, body);
    return jsonResponse(result, result.success ? 200 : 400);
  }

  // DELETE /api/configs/:id - 删除配置
  if (path.match(/^\/api\/configs\/\d+$/) && request.method === "DELETE") {
    const id = path.split("/").pop();
    const result = await deleteConfigFromDB(env, id);
    return jsonResponse(result, result.success ? 200 : 400);
  }

  // GET /api/status - 获取系统状态（存储模式、数据库连接）
  if (path === "/api/status" && request.method === "GET") {
    const hasDbConfig = Boolean(env.SUPABASE_URL && env.SUPABASE_KEY);
    const result = {
      success: true,
      storage_mode: hasDbConfig ? "database" : "passthrough",
      database_configured: hasDbConfig,
      database_connected: false,
    };

    if (hasDbConfig) {
      // 测试数据库连接
      try {
        const response = await fetch(
          `${env.SUPABASE_URL}/rest/v1/api_configs?select=count&limit=1`,
          {
            headers: {
              apikey: env.SUPABASE_KEY,
              Authorization: `Bearer ${env.SUPABASE_KEY}`,
            },
          }
        );
        result.database_connected = response.ok;
        if (!response.ok) {
          result.database_error = `HTTP ${response.status}`;
        }
      } catch (error) {
        result.database_connected = false;
        result.database_error = error.message;
      }
    }

    return jsonResponse(result);
  }

  return jsonResponse({ error: "Not found" }, 404);
}

/**
 * 处理代理请求
 * 支持两种格式:
 * 1. Authorization: Bearer https://api.example.com:123 (按 ID 查找 token)
 * 2. Authorization: Bearer https://api.example.com:sk-xxx (直接使用 token)
 */
async function handleProxyRequest(request, env, url) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized - Missing or invalid Authorization header" }, 401);
  }

  const authValue = authHeader.substring(7).trim(); // 去掉 "Bearer " 前缀

  // 解析格式: <api_url>:<key>
  // 需要从最后一个冒号分割，因为 URL 中可能包含端口号 (https://api.example.com:8080:key)
  const lastColonIndex = authValue.lastIndexOf(":");
  if (lastColonIndex === -1 || lastColonIndex < 8) {
    // 没有冒号，或者冒号在 https:// 中
    return jsonResponse({
      error: 'Invalid format - expected: <api_url>:<id> or <api_url>:<token>'
    }, 400);
  }

  const targetApiUrl = authValue.substring(0, lastColonIndex);
  const keyPart = authValue.substring(lastColonIndex + 1);

  // 验证 API URL 格式
  if (!targetApiUrl.startsWith("http://") && !targetApiUrl.startsWith("https://")) {
    return jsonResponse({ error: "Invalid API URL format - must start with http:// or https://" }, 400);
  }

  if (!keyPart) {
    return jsonResponse({ error: "Missing key/token after URL" }, 400);
  }

  // 获取配置
  const config = await getConfigFromDB(env);

  let tokenToUse;

  // 判断是 key_id (6位字母数字) 还是直接 token
  const isKeyId = /^[a-z0-9]{6}$/.test(keyPart);

  if (isKeyId) {
    // 按 key_id 查找 token
    const keyId = keyPart;

    // 检查该 API URL 是否在配置中
    if (!config[targetApiUrl]) {
      return jsonResponse({ error: "API URL not configured: " + targetApiUrl }, 404);
    }

    // 在该 URL 的 keys 中查找指定 key_id
    const keyConfig = config[targetApiUrl].keys.find(k => k.key_id === keyId);
    if (!keyConfig) {
      return jsonResponse({ error: "Key ID not found: " + keyId }, 404);
    }

    if (!keyConfig.enabled) {
      return jsonResponse({ error: "Key ID " + keyId + " is disabled" }, 403);
    }

    tokenToUse = keyConfig.token;
  } else {
    // 直接使用传入的 token
    tokenToUse = keyPart;
  }

  // 设置目标主机和协议
  const targetUrl = new URL(targetApiUrl);
  url.protocol = targetUrl.protocol;
  url.hostname = targetUrl.hostname;
  url.port = targetUrl.port || "";

  // 获取原始请求头
  const headers = new Headers(request.headers);

  // 设置 Authorization header
  headers.set("authorization", "Bearer " + tokenToUse);

  const modifiedRequest = new Request(url.toString(), {
    headers: headers,
    method: request.method,
    body: request.body,
    redirect: "follow",
  });

  try {
    const response = await fetch(modifiedRequest);
    const modifiedResponse = new Response(response.body, response);

    // 添加允许跨域访问的响应头
    modifiedResponse.headers.set("Access-Control-Allow-Origin", "*");

    return modifiedResponse;
  } catch (error) {
    console.error("Proxy request error:", error);
    return jsonResponse(
      { error: "Failed to proxy request to " + targetApiUrl },
      503
    );
  }
}

/**
 * 处理 CORS
 */
function handleCORS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

/**
 * 返回 JSON 响应
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ============ HTML 页面 ============

/**
 * 生成状态页面 HTML
 */
function getStatusHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AnyRouter - API Proxy Service</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(10px);
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      padding: 48px;
      max-width: 520px;
      width: 100%;
      text-align: center;
    }
    .logo {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
    .logo i { font-size: 36px; color: white; }
    h1 {
      font-size: 32px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 8px;
    }
    .tagline {
      color: #666;
      font-size: 16px;
      margin-bottom: 24px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 10px 24px;
      border-radius: 50px;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 32px;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
    }
    .status i { animation: pulse 2s infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .features {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 32px;
      text-align: left;
    }
    .feature {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      background: #f8f9ff;
      border-radius: 12px;
    }
    .feature i {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      font-size: 14px;
    }
    .feature span { font-size: 13px; color: #444; font-weight: 500; }
    .buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 14px 28px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      transition: all 0.3s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
    }
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }
    .btn-secondary:hover {
      background: #e0e0e0;
      transform: translateY(-2px);
    }
    .footer {
      margin-top: 24px;
      color: rgba(255,255,255,0.8);
      font-size: 14px;
    }
    .footer a {
      color: white;
      text-decoration: none;
      font-weight: 600;
    }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><i class="fas fa-route"></i></div>
    <h1>AnyRouter</h1>
    <p class="tagline">轻量级 API 代理服务</p>
    <div class="status"><i class="fas fa-circle"></i> 服务运行中</div>
    <div class="features">
      <div class="feature"><i class="fas fa-globe"></i><span>多端点代理</span></div>
      <div class="feature"><i class="fas fa-key"></i><span>Token 管理</span></div>
      <div class="feature"><i class="fas fa-shield-alt"></i><span>安全转发</span></div>
      <div class="feature"><i class="fas fa-bolt"></i><span>边缘加速</span></div>
    </div>
    <div class="buttons">
      <a href="/admin" class="btn btn-primary"><i class="fas fa-cog"></i>管理面板</a>
      <a href="https://github.com/dext7r/anyrouter" target="_blank" class="btn btn-secondary"><i class="fab fa-github"></i>GitHub</a>
    </div>
  </div>
  <div class="footer">
    <div>Powered by <a href="https://workers.cloudflare.com" target="_blank">Cloudflare Workers</a></div>
    <div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">
      <i class="fas fa-clock"></i> 部署时间: ${new Date(BUILD_TIME).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
    </div>
  </div>
</body>
</html>`;
}

/**
 * 生成管理页面 HTML
 */
function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Proxy Admin</title>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    .gradient-bg {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .glass-effect {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }

    .card-hover {
      transition: all 0.3s ease;
    }

    .card-hover:hover {
      transform: translateY(-2px);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      transition: all 0.3s ease;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }

    .animate-fade-in {
      animation: fadeIn 0.5s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .toggle-checkbox:checked {
      background-color: #4ade80;
      border-color: #4ade80;
    }

    .toggle-checkbox {
      transition: all 0.3s ease;
    }

    .api-badge {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .stats-card {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
      border-left: 4px solid #667eea;
    }

    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      border-radius: 12px;
      color: white;
      font-weight: 500;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      z-index: 9999;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .toast-success {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }

    .toast-error {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    }

    .toast-info {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }

    #configsTable {
      border-collapse: separate;
      border-spacing: 0;
    }

    #configsTable thead th {
      position: sticky;
      top: 0;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
      z-index: 10;
    }

    #configsTable tbody tr:last-child td {
      border-bottom: none;
    }

    /* Mini 精细化样式 */
    .mini-input {
      padding: 6px 10px !important;
      font-size: 13px !important;
    }

    .mini-btn {
      padding: 6px 12px !important;
      font-size: 12px !important;
    }

    .mini-table th,
    .mini-table td {
      padding: 8px 10px !important;
      font-size: 12px !important;
    }

    .mini-card {
      padding: 16px !important;
    }

    .mini-text {
      font-size: 12px !important;
    }

    .remark-cell {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .compact-header {
      padding: 12px 16px !important;
    }
  </style>
</head>
<body class="gradient-bg min-h-screen">
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <!-- Login Form -->
    <div id="loginPanel" class="min-h-screen flex items-center justify-center animate-fade-in">
      <div class="glass-effect rounded-3xl shadow-2xl p-10 max-w-md w-full">
        <div class="text-center mb-8">
          <div class="inline-block p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-4">
            <i class="fas fa-lock text-white text-3xl"></i>
          </div>
          <h2 class="text-3xl font-bold text-gray-800 mb-2">管理员登录</h2>
          <p class="text-gray-500">输入密码以访问管理面板</p>
        </div>
        <div class="space-y-5">
          <div class="relative">
            <i class="fas fa-key absolute left-4 top-4 text-gray-400"></i>
            <input
              type="password"
              id="passwordInput"
              placeholder="请输入管理员密码"
              class="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 transition-all"
            >
          </div>
          <button
            id="loginBtn"
            class="w-full py-3 btn-primary text-white rounded-xl font-semibold shadow-lg"
          >
            <i class="fas fa-sign-in-alt mr-2"></i>登录
          </button>
          <div id="loginError" class="text-red-500 text-sm text-center hidden"></div>
        </div>
      </div>
    </div>

    <!-- Admin Panel -->
    <div id="adminPanel" class="hidden animate-fade-in">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-4xl font-bold text-white mb-2">
            <i class="fas fa-rocket mr-3"></i>API Proxy 管理中心
          </h1>
          <p class="text-purple-100">管理你的 API 端点和密钥配置</p>
        </div>
        <div class="flex gap-3">
          <a href="https://github.com/dext7r/anyrouter" target="_blank" class="glass-effect px-6 py-3 text-purple-700 rounded-xl hover:bg-white transition-all font-semibold shadow-lg">
            <i class="fab fa-github mr-2"></i>GitHub
          </a>
          <button id="logoutBtn" class="glass-effect px-6 py-3 text-purple-700 rounded-xl hover:bg-white transition-all font-semibold shadow-lg">
            <i class="fas fa-sign-out-alt mr-2"></i>退出登录
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div id="statsCards" class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <!-- 存储模式卡片 -->
        <div class="glass-effect rounded-2xl p-6 card-hover">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-gray-500 text-sm font-medium mb-1">存储模式</p>
              <h3 id="storageMode" class="text-xl font-bold text-gray-800">检测中...</h3>
            </div>
            <div id="storageModeIcon" class="p-4 bg-gray-100 rounded-xl">
              <i class="fas fa-circle-notch fa-spin text-gray-400 text-2xl"></i>
            </div>
          </div>
          <div id="dbStatus" class="text-xs text-gray-500">
            <span id="dbStatusText">正在检测...</span>
          </div>
          <button id="testDbBtn" class="mt-3 w-full py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all font-medium">
            <i class="fas fa-plug mr-1"></i>测试连接
          </button>
        </div>
        <div class="glass-effect rounded-2xl p-6 card-hover">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-gray-500 text-sm font-medium mb-1">API 数量</p>
              <h3 id="totalApis" class="text-3xl font-bold text-gray-800">0</h3>
            </div>
            <div class="p-4 bg-blue-100 rounded-xl">
              <i class="fas fa-server text-blue-600 text-2xl"></i>
            </div>
          </div>
        </div>
        <div class="glass-effect rounded-2xl p-6 card-hover">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-gray-500 text-sm font-medium mb-1">总密钥数</p>
              <h3 id="totalKeys" class="text-3xl font-bold text-gray-800">0</h3>
            </div>
            <div class="p-4 bg-purple-100 rounded-xl">
              <i class="fas fa-key text-purple-600 text-2xl"></i>
            </div>
          </div>
        </div>
        <div class="glass-effect rounded-2xl p-6 card-hover">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-gray-500 text-sm font-medium mb-1">已启用</p>
              <h3 id="enabledKeys" class="text-3xl font-bold text-green-600">0</h3>
            </div>
            <div class="p-4 bg-green-100 rounded-xl">
              <i class="fas fa-check-circle text-green-600 text-2xl"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Start Guide -->
      <div class="glass-effect rounded-2xl shadow-xl mb-8 overflow-hidden">
        <div class="p-6 cursor-pointer flex items-center justify-between hover:bg-purple-50 transition-all" onclick="toggleGuide()">
          <h2 class="text-2xl font-bold text-gray-800">
            <i class="fas fa-book-open mr-2 text-purple-600"></i>快速使用指南
          </h2>
          <i id="guideToggle" class="fas fa-chevron-down text-purple-600 transition-transform"></i>
        </div>
        <div id="guideContent" class="hidden border-t border-purple-100">
          <div class="p-6 space-y-6">
            <!-- 使用格式 -->
            <div>
              <h3 class="text-lg font-semibold text-gray-800 mb-3"><i class="fas fa-code text-purple-500 mr-2"></i>请求格式</h3>
              <div class="bg-gray-900 rounded-xl p-4 font-mono text-sm text-green-400 overflow-x-auto">
                Authorization: Bearer &lt;API_URL&gt;:&lt;Key ID 或 Token&gt;
              </div>
            </div>

            <!-- 两种模式 -->
            <div class="grid md:grid-cols-2 gap-4">
              <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-300 relative">
                <span class="absolute -top-3 left-4 bg-blue-500 text-white text-xs px-3 py-1 rounded-full font-bold">Key ID 模式</span>
                <h4 class="font-semibold text-blue-800 mb-2 mt-2"><i class="fas fa-database mr-2"></i>从数据库查找</h4>
                <p class="text-sm text-blue-700 mb-3">使用 6 位随机 ID，系统自动查找对应的 Token</p>
                <div class="bg-blue-100 rounded-lg p-3">
                  <div class="text-xs text-blue-600 mb-1">格式：URL:6位字母数字</div>
                  <code class="text-sm text-blue-900 font-mono">Bearer https://api.openai.com:<strong>a3x9k2</strong></code>
                </div>
                <div class="mt-3 text-xs text-blue-600"><i class="fas fa-check-circle mr-1"></i>适合：多 Token 轮询、统一管理</div>
              </div>
              <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-300 relative">
                <span class="absolute -top-3 left-4 bg-green-500 text-white text-xs px-3 py-1 rounded-full font-bold">直传模式</span>
                <h4 class="font-semibold text-green-800 mb-2 mt-2"><i class="fas fa-bolt mr-2"></i>直接传递 Token</h4>
                <p class="text-sm text-green-700 mb-3">直接在请求中传递实际的 API Token</p>
                <div class="bg-green-100 rounded-lg p-3">
                  <div class="text-xs text-green-600 mb-1">格式：URL:实际Token</div>
                  <code class="text-sm text-green-900 font-mono">Bearer https://api.openai.com:<strong>sk-xxx</strong></code>
                </div>
                <div class="mt-3 text-xs text-green-600"><i class="fas fa-check-circle mr-1"></i>适合：临时使用、无需配置</div>
              </div>
            </div>

            <!-- 模式判断说明 -->
            <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h4 class="font-semibold text-yellow-800 mb-2"><i class="fas fa-info-circle mr-2"></i>系统如何判断模式？</h4>
              <p class="text-sm text-yellow-700">冒号后面是<strong>6位字母数字</strong>（如 a3x9k2）→ Key ID 模式（查数据库）；否则 → 直传模式（直接转发）</p>
            </div>

            <!-- 示例代码 -->
            <div>
              <h3 class="text-lg font-semibold text-gray-800 mb-3"><i class="fas fa-terminal text-purple-500 mr-2"></i>示例代码</h3>
              <div class="space-y-3">
                <!-- cURL -->
                <div class="bg-gray-900 rounded-xl p-4 font-mono text-sm overflow-x-auto">
                  <div class="text-gray-400 mb-2"># cURL 示例</div>
                  <div class="text-green-400">curl -X POST '<span class="text-yellow-300 proxy-url-placeholder" id="proxyUrlExample">https://your-proxy.workers.dev</span>/v1/chat/completions' \\</div>
                  <div class="text-green-400 pl-4">-H 'Authorization: Bearer https://api.openai.com:<span class="text-cyan-300">a3x9k2</span>' \\</div>
                  <div class="text-green-400 pl-4">-H 'Content-Type: application/json' \\</div>
                  <div class="text-green-400 pl-4">-d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello"}]}'</div>
                </div>

                <!-- OpenAI SDK -->
                <div class="bg-gray-900 rounded-xl p-4 font-mono text-sm overflow-x-auto">
                  <div class="text-gray-400 mb-2"># Python OpenAI SDK</div>
                  <div class="text-purple-400">from openai import OpenAI</div>
                  <div class="text-green-400 mt-2">client = OpenAI(</div>
                  <div class="text-green-400 pl-4">base_url='<span class="text-yellow-300 proxy-url-placeholder">https://your-proxy.workers.dev</span>/v1',</div>
                  <div class="text-green-400 pl-4">api_key='https://api.openai.com:<span class="text-cyan-300">a3x9k2</span>'  <span class="text-gray-500"># URL:Key ID 格式</span></div>
                  <div class="text-green-400">)</div>
                </div>
              </div>
            </div>

            <!-- 快速操作提示 -->
            <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
              <h4 class="font-semibold text-purple-800 mb-2"><i class="fas fa-lightbulb mr-2"></i>快捷操作</h4>
              <ul class="text-sm text-purple-700 space-y-1">
                <li>• 点击表格中的 <code class="bg-purple-100 px-1 rounded">ID</code> 可直接复制</li>
                <li>• 点击 <code class="bg-purple-100 px-1 rounded">复制 URL</code> 按钮复制 API 地址</li>
                <li>• 点击 <code class="bg-purple-100 px-1 rounded">添加 Token</code> 快速为该 URL 添加新密钥</li>
                <li>• 点击行可展开/折叠该 URL 下的所有 Token</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Add New Config Card -->
      <div class="glass-effect rounded-2xl shadow-xl mini-card mb-6 card-hover">
        <h2 class="text-lg font-bold text-gray-800 mb-4">
          <i class="fas fa-plus-circle mr-2 text-purple-600"></i>添加新配置
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div class="md:col-span-3">
            <label class="block text-xs font-medium text-gray-600 mb-1">API URL</label>
            <input
              type="text"
              id="newApiUrl"
              list="existingUrls"
              placeholder="https://api.example.com"
              class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"
            >
            <datalist id="existingUrls"></datalist>
          </div>
          <div class="md:col-span-3">
            <label class="block text-xs font-medium text-gray-600 mb-1">Token</label>
            <input
              type="text"
              id="newToken"
              placeholder="sk-xxxxxxxxxxxxxxxx"
              class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"
            >
          </div>
          <div class="md:col-span-3">
            <label class="block text-xs font-medium text-gray-600 mb-1">备注</label>
            <input
              type="text"
              id="newRemark"
              placeholder="可选备注说明"
              maxlength="255"
              class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"
            >
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 mb-1">状态</label>
            <select
              id="newEnabled"
              class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"
            >
              <option value="true">✓ 启用</option>
              <option value="false">✗ 禁用</option>
            </select>
          </div>
          <div class="md:col-span-1 flex items-end">
            <button
              id="addBtn"
              class="w-full mini-btn btn-primary text-white rounded-lg font-medium shadow"
            >
              <i class="fas fa-plus"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Configs Table -->
      <div class="glass-effect rounded-2xl shadow-xl mini-card">
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-lg font-bold text-gray-800">
            <i class="fas fa-table mr-2 text-purple-600"></i>配置列表
          </h2>
          <div class="flex gap-2">
            <button onclick="copyAllTokens()" class="mini-btn bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-all font-medium" title="批量复制">
              <i class="fas fa-copy"></i>
            </button>
            <select id="sortBy" class="mini-input bg-purple-50 text-purple-700 rounded-lg font-medium focus:outline-none border-0">
              <option value="created_at">创建时间</option>
              <option value="updated_at">更新时间</option>
              <option value="api_url">API URL</option>
              <option value="enabled">状态</option>
            </select>
            <button id="refreshBtn" class="mini-btn bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all font-medium">
              <i class="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>
        <!-- 搜索框 -->
        <div class="mb-3">
          <input type="text" id="searchInput" placeholder="搜索 API URL、Token 或备注..."
                 class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"
                 oninput="filterConfigs()"
          />
        </div>
        <div class="overflow-x-auto">
          <table id="configsTable" class="w-full mini-table">
            <thead>
              <tr class="border-b border-purple-200">
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">API URL</th>
                <th class="text-center py-2 px-2 font-medium text-gray-600 text-xs">ID</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">Token</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">备注</th>
                <th class="text-center py-2 px-2 font-medium text-gray-600 text-xs">状态</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">创建时间</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">更新时间</th>
                <th class="text-center py-2 px-2 font-medium text-gray-600 text-xs">操作</th>
              </tr>
            </thead>
            <tbody id="configsTableBody">
              <tr>
                <td colspan="8" class="text-center text-gray-500 py-8">
                  <i class="fas fa-spinner fa-spin text-2xl mb-2 text-purple-400"></i>
                  <p class="text-sm">加载中...</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- 分页 -->
        <div id="pagination"></div>
      </div>
    </div>
  </div>

  <!-- 编辑 Modal -->
  <div id="editModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="backdrop-filter: blur(5px);">
    <div class="glass-effect rounded-xl shadow-2xl p-5 max-w-md w-full mx-4 animate-fade-in">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-gray-800">
          <i class="fas fa-edit mr-2 text-purple-600"></i>编辑配置
        </h3>
        <button onclick="closeEditModal()" class="text-gray-400 hover:text-gray-600">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">API URL</label>
          <input
            type="text"
            id="editApiUrl"
            class="w-full mini-input border border-gray-200 rounded-lg bg-gray-50"
            readonly
          >
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Token</label>
          <input
            type="text"
            id="editToken"
            class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all font-mono"
            placeholder="sk-xxxxxxxxxxxxxxxx"
          >
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">备注</label>
          <input
            type="text"
            id="editRemark"
            class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"
            placeholder="可选备注说明"
            maxlength="255"
          >
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">状态</label>
          <select
            id="editEnabled"
            class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"
          >
            <option value="true">启用</option>
            <option value="false">禁用</option>
          </select>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button
          onclick="closeEditModal()"
          class="mini-btn bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium"
        >
          取消
        </button>
        <button
          id="saveEditBtn"
          class="mini-btn btn-primary text-white rounded-lg font-medium shadow"
        >
          <i class="fas fa-save mr-1"></i>保存
        </button>
      </div>
    </div>
  </div>

  <script>
    let authToken = localStorage.getItem('authToken');
    let currentConfigs = [];
    let currentEditId = null;
    let isDatabaseMode = false;

    // 初始化
    $(document).ready(function() {
      if (authToken) {
        showAdminPanel();
      } else {
        showLoginPanel();
      }

      // 更新示例中的代理 URL 为当前域名
      const proxyUrl = window.location.origin;
      $('#proxyUrlExample').text(proxyUrl);

      // 测试数据库连接按钮
      $('#testDbBtn').click(function() {
        checkSystemStatus();
      });
      $('.proxy-url-placeholder').text(proxyUrl);
    });

    // 折叠/展开使用指南
    function toggleGuide() {
      const content = $('#guideContent');
      const toggle = $('#guideToggle');
      if (content.hasClass('hidden')) {
        content.removeClass('hidden');
        toggle.css('transform', 'rotate(180deg)');
      } else {
        content.addClass('hidden');
        toggle.css('transform', 'rotate(0deg)');
      }
    }

    // 登录
    $('#loginBtn').click(function() {
      const password = $('#passwordInput').val().trim();
      if (!password) {
        showError('请输入密码');
        return;
      }

      authToken = password;
      localStorage.setItem('authToken', password);

      // 测试密码是否正确
      loadConfigs(true);
    });

    $('#passwordInput').keypress(function(e) {
      if (e.which === 13) {
        $('#loginBtn').click();
      }
    });

    // 退出登录
    $('#logoutBtn').click(function() {
      authToken = null;
      localStorage.removeItem('authToken');
      showLoginPanel();
    });

    // 刷新配置
    $('#refreshBtn').click(function() {
      loadConfigs();
    });

    // 添加配置
    $('#addBtn').click(async function() {
      const apiUrl = $('#newApiUrl').val().trim();
      const token = $('#newToken').val().trim();
      const remark = $('#newRemark').val().trim();
      const enabled = $('#newEnabled').val() === 'true';

      if (!apiUrl || !token) {
        showToast('请填写 API URL 和 Token', 'error');
        return;
      }

      const btn = $(this);
      btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

      try {
        const response = await fetch('/api/configs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ api_url: apiUrl, token, enabled, remark })
        });

        const result = await response.json();

        if (result.success) {
          $('#newApiUrl').val('');
          $('#newToken').val('');
          $('#newRemark').val('');
          loadConfigs();
          showToast('添加成功', 'success');
        } else {
          showToast('添加失败: ' + result.error, 'error');
        }
      } catch (error) {
        showToast('请求失败: ' + error.message, 'error');
      } finally {
        btn.prop('disabled', false).html('<i class="fas fa-plus"></i>');
      }
    });

    // 加载配置列表
    async function loadConfigs(isLoginAttempt = false) {
      try {
        const response = await fetch('/api/configs', {
          headers: {
            'Authorization': 'Bearer ' + authToken
          }
        });

        if (response.status === 401) {
          showError('密码错误，请重新登录');
          localStorage.removeItem('authToken');
          showLoginPanel();
          return;
        }

        const result = await response.json();

        if (result.success) {
          // 仅在登录尝试时切换到管理面板
          if (isLoginAttempt) {
            $('#loginPanel').addClass('hidden');
            $('#adminPanel').removeClass('hidden');
            checkSystemStatus();
          }
          renderConfigs(result.data);
        } else {
          showError('加载失败: ' + result.error);
        }
      } catch (error) {
        showError('请求失败: ' + error.message);
      }
    }

    // 渲染配置列表
    function renderConfigs(configs) {
      // 将配置转换为扁平数组
      const rows = [];
      Object.entries(configs).forEach(([apiUrl, config]) => {
        config.keys.forEach(key => {
          rows.push({
            id: key.id,
            key_id: key.key_id,
            api_url: apiUrl,
            token: key.token,
            enabled: key.enabled,
            remark: key.remark || '',
            created_at: key.created_at,
            updated_at: key.updated_at
          });
        });
      });

      currentConfigs = rows;

      // 更新统计
      const uniqueApis = new Set(rows.map(r => r.api_url)).size;
      const enabledCount = rows.filter(r => r.enabled).length;
      $('#totalApis').text(uniqueApis);
      $('#totalKeys').text(rows.length);
      $('#enabledKeys').text(enabledCount);

      // 更新 API URL 下拉列表（用于快速添加）
      updateUrlDatalist(rows);

      // 排序
      sortConfigs();
    }

    // 更新 API URL 下拉列表
    function updateUrlDatalist(rows) {
      const uniqueUrls = [...new Set(rows.map(r => r.api_url))].sort();
      const datalist = $('#existingUrls');
      datalist.empty();
      uniqueUrls.forEach(url => {
        const tokenCount = rows.filter(r => r.api_url === url).length;
        datalist.append(\`<option value="\${url}">\${url} (\${tokenCount} 个 token)</option>\`);
      });
    }

    // 排序配置
    function sortConfigs() {
      const sortBy = $('#sortBy').val();
      let sorted = [...currentConfigs];

      // 先按 API URL 分组
      sorted.sort((a, b) => {
        return a.api_url.localeCompare(b.api_url);
      });

      // 再按选定的字段排序
      sorted.sort((a, b) => {
        if (sortBy === 'created_at' || sortBy === 'updated_at') {
          return new Date(b[sortBy]) - new Date(a[sortBy]);
        } else if (sortBy === 'enabled') {
          return b.enabled - a.enabled;
        } else if (sortBy === 'api_url') {
          return a.api_url.localeCompare(b.api_url);
        }
        return 0;
      });

      renderTable(sorted);
    }

    // 搜索和过滤
    window.filterConfigs = function() {
      const searchText = $('#searchInput').val().toLowerCase();
      if (!searchText) {
        sortConfigs();
        return;
      }

      const filtered = currentConfigs.filter(row =>
        row.api_url.toLowerCase().includes(searchText) ||
        row.token.toLowerCase().includes(searchText) ||
        maskToken(row.token).toLowerCase().includes(searchText) ||
        (row.remark && row.remark.toLowerCase().includes(searchText))
      );

      renderTable(filtered);
    }

    // 批量复制所有 token
    window.copyAllTokens = function() {
      if (currentConfigs.length === 0) {
        showToast('暂无配置', 'error');
        return;
      }

      const tokens = currentConfigs
        .filter(r => r.enabled)
        .map(r => \`\${r.api_url}: \${r.token}\`)
        .join('\\n');

      navigator.clipboard.writeText(tokens).then(() => {
        showToast(\`✓ 已复制 \${currentConfigs.filter(r => r.enabled).length} 个已启用的 token\`, 'success');
      }).catch(() => {
        showToast('复制失败', 'error');
      });
    }

    // 分页配置
    let currentPage = 1;
    const pageSize = 10; // 每页显示的 API URL 数量

    // 渲染表格（分组视图）
    function renderTable(rows) {
      if (rows.length === 0) {
        const emptyMsg = isDatabaseMode
          ? '<p class="text-xs text-gray-400 mt-1">点击上方按钮添加第一个配置</p>'
          : '<p class="text-xs text-yellow-600 mt-1"><i class="fas fa-info-circle mr-1"></i>直传模式，无需配置</p>';
        $('#configsTableBody').html(\`
          <tr>
            <td colspan="8" class="text-center text-gray-500 py-8">
              <i class="fas \${isDatabaseMode ? 'fa-inbox' : 'fa-bolt'} text-3xl mb-2 \${isDatabaseMode ? 'text-gray-300' : 'text-yellow-300'}"></i>
              <p class="text-sm font-medium">\${isDatabaseMode ? '暂无配置' : '直传模式'}</p>
              \${emptyMsg}
            </td>
          </tr>
        \`);
        $('#pagination').html('');
        return;
      }

      // 按 API URL 分组
      const grouped = {};
      rows.forEach(row => {
        if (!grouped[row.api_url]) {
          grouped[row.api_url] = [];
        }
        grouped[row.api_url].push(row);
      });

      const apiUrls = Object.keys(grouped).sort();
      const totalPages = Math.ceil(apiUrls.length / pageSize);
      const startIdx = (currentPage - 1) * pageSize;
      const endIdx = startIdx + pageSize;
      const pagedUrls = apiUrls.slice(startIdx, endIdx);

      let html = '';

      pagedUrls.forEach((apiUrl, urlIdx) => {
        const tokens = grouped[apiUrl];
        const enabledCount = tokens.filter(t => t.enabled).length;
        const urlId = 'url-' + urlIdx + '-' + startIdx;

        // API URL 行
        html += \`
          <tr class="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-200 cursor-pointer url-header-row" data-url-id="\${urlId}">
            <td colspan="8" class="py-2 px-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <i class="fas fa-chevron-down text-purple-600 text-xs transition-transform url-toggle" id="toggle-\${urlId}"></i>
                  <a href="\${apiUrl}" target="_blank" rel="noopener noreferrer"
                     class="font-medium text-xs text-purple-700 hover:text-purple-900 hover:underline truncate max-w-xs"
                     onclick="event.stopPropagation()" title="\${apiUrl}">
                    \${apiUrl}
                  </a>
                  <span class="px-2 py-0.5 bg-purple-200 text-purple-700 rounded-full text-xs">
                    \${tokens.length}
                  </span>
                  <span class="px-2 py-0.5 \${enabledCount > 0 ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-500'} rounded-full text-xs">
                    \${enabledCount} 启用
                  </span>
                </div>
                <div class="flex items-center gap-1 action-buttons">
                  <button class="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded hover:bg-blue-200 transition-all copy-url-btn" title="复制" data-url="\${encodeURIComponent(apiUrl)}">
                    <i class="fas fa-copy"></i>
                  </button>
                  \${isDatabaseMode ? \`<button class="px-2 py-1 bg-green-100 text-green-600 text-xs rounded hover:bg-green-200 transition-all add-token-btn" title="添加" data-url="\${encodeURIComponent(apiUrl)}">
                    <i class="fas fa-plus"></i>
                  </button>\` : ''}
                </div>
              </div>
            </td>
          </tr>
        \`;

        // Token 子行
        tokens.forEach((row, tokenIdx) => {
          const safeRemark = escapeHtml(row.remark);
          html += \`
            <tr class="border-b border-gray-50 hover:bg-purple-50 transition-all token-row token-row-\${urlId}">
              <td class="py-1.5 px-2 pl-6"><span class="text-gray-400 text-xs">#\${tokenIdx + 1}</span></td>
              <td class="py-1.5 px-2 text-center">
                <div class="flex items-center justify-center gap-1">
                  <code class="text-xs font-mono bg-purple-100 px-1.5 py-0.5 rounded text-purple-700 cursor-pointer hover:bg-purple-200 id-copy-btn" title="点击复制">\${row.key_id || row.id}</code>
                  <button class="p-0.5 text-xs bg-green-100 text-green-600 rounded hover:bg-green-200 full-key-copy-btn" data-url="\${encodeURIComponent(apiUrl)}" data-keyid="\${row.key_id || row.id}" title="复制完整Key"><i class="fas fa-link text-xs"></i></button>
                </div>
              </td>
              <td class="py-1.5 px-2">
                <code class="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 cursor-pointer hover:bg-gray-200 token-copy-btn" data-token="\${window.btoa(row.token)}" title="点击复制">\${maskToken(row.token)}</code>
              </td>
              <td class="py-1.5 px-2 remark-cell text-xs text-gray-500" title="\${safeRemark}">\${safeRemark || '-'}</td>
              <td class="py-1.5 px-2 text-center">
                <input type="checkbox" \${row.enabled ? 'checked' : ''} class="w-3 h-3 text-green-600 rounded status-checkbox" data-id="\${row.id}">
              </td>
              <td class="py-1.5 px-2 text-xs text-gray-400">\${formatDate(row.created_at)}</td>
              <td class="py-1.5 px-2 text-xs text-gray-400">\${formatDate(row.updated_at)}</td>
              <td class="py-1.5 px-2 text-center">
                <button class="p-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 edit-key-btn" data-id="\${row.id}"><i class="fas fa-edit text-xs"></i></button>
                <button class="p-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 delete-key-action-btn" data-id="\${row.id}"><i class="fas fa-trash-alt text-xs"></i></button>
              </td>
            </tr>
          \`;
        });
      });

      $('#configsTableBody').html(html);
      renderPagination(totalPages, apiUrls.length);
    }

    // 渲染分页
    function renderPagination(totalPages, totalItems) {
      if (totalPages <= 1) { $('#pagination').html(''); return; }
      let pHtml = '<div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100"><div class="text-xs text-gray-400">' + totalItems + ' 个 API · ' + currentPage + '/' + totalPages + '</div><div class="flex gap-1">';
      if (currentPage > 1) pHtml += '<button class="px-2 py-0.5 bg-purple-100 text-purple-600 rounded text-xs hover:bg-purple-200 page-btn" data-page="' + (currentPage - 1) + '"><i class="fas fa-chevron-left"></i></button>';
      for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        pHtml += '<button class="px-2 py-0.5 ' + (i === currentPage ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-600 hover:bg-purple-200') + ' rounded text-xs page-btn" data-page="' + i + '">' + i + '</button>';
      }
      if (currentPage < totalPages) pHtml += '<button class="px-2 py-0.5 bg-purple-100 text-purple-600 rounded text-xs hover:bg-purple-200 page-btn" data-page="' + (currentPage + 1) + '"><i class="fas fa-chevron-right"></i></button>';
      pHtml += '</div></div>';
      $('#pagination').html(pHtml);
    }

    // 事件监听器（使用委托）
    $(document).on('click', '.token-copy-btn', function() {
      const encodedToken = $(this).data('token');
      if (encodedToken) {
        copyToken(window.atob(encodedToken));
      }
    });

    $(document).on('click', '.id-copy-btn', function() {
      const id = $(this).text();
      navigator.clipboard.writeText(id).then(() => {
        showToast('ID ' + id + ' 已复制', 'success');
      });
    });

    // 复制完整可用 Key (api_url:key_id)
    $(document).on('click', '.full-key-copy-btn', function() {
      const url = decodeURIComponent($(this).data('url'));
      const keyId = $(this).data('keyid');
      const fullKey = url + ':' + keyId;
      navigator.clipboard.writeText(fullKey).then(() => {
        showToast('✓ 完整 Key 已复制: ' + url.substring(0, 20) + '...:' + keyId, 'success');
      }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = fullKey;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('✓ 完整 Key 已复制', 'success');
      });
    });

    $(document).on('change', '.status-checkbox', function() {
      const id = $(this).data('id');
      toggleKey(id, $(this).is(':checked'));
    });

    $(document).on('click', '.edit-key-btn', function() {
      openEditModal($(this).data('id'));
    });

    $(document).on('click', '.delete-key-action-btn', function() {
      deleteKey($(this).data('id'));
    });

    // URL 复制按钮
    $(document).on('click', '.copy-url-btn', function() {
      const url = decodeURIComponent($(this).data('url'));
      navigator.clipboard.writeText(url).then(() => {
        showToast('✓ URL 已复制', 'success');
      }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('✓ URL 已复制', 'success');
      });
    });

    // 添加 Token 按钮
    $(document).on('click', '.add-token-btn', function() {
      const url = decodeURIComponent($(this).data('url'));
      $('#newApiUrl').val(url);
      // 滚动到添加表单区域
      $('html, body').animate({
        scrollTop: $('#newApiUrl').offset().top - 100
      }, 300, function() {
        $('#newToken').focus();
        // 添加高亮效果
        $('#newToken').addClass('ring-2 ring-purple-500');
        setTimeout(() => $('#newToken').removeClass('ring-2 ring-purple-500'), 2000);
      });
      showToast('已填充 URL，请输入 Token', 'info');
    });

    // URL 行折叠/展开
    $(document).on('click', '.url-header-row', function(e) {
      // 忽略按钮和操作区域的点击
      if ($(e.target).closest('.action-buttons').length > 0) {
        return;
      }
      const urlId = $(this).data('url-id');
      const toggle = $('#toggle-' + urlId);
      const rows = $('.token-row-' + urlId);

      if (toggle.hasClass('fa-chevron-down')) {
        toggle.removeClass('fa-chevron-down').addClass('fa-chevron-right');
        rows.hide();
      } else {
        toggle.removeClass('fa-chevron-right').addClass('fa-chevron-down');
        rows.show();
      }
    });

    // 分页按钮
    $(document).on('click', '.page-btn', function() {
      currentPage = parseInt($(this).data('page'));
      sortConfigs();
    });

    // 排序变化监听
    $('#sortBy').change(function() {
      sortConfigs();
    });

    // 打开编辑模态框
    window.openEditModal = function(id) {
      const config = currentConfigs.find(c => c.id === id);
      if (!config) return;

      currentEditId = id;
      $('#editApiUrl').val(config.api_url);
      $('#editToken').val(config.token);
      $('#editRemark').val(config.remark || '');
      $('#editEnabled').val(config.enabled.toString());
      $('#editModal').removeClass('hidden');
    };

    // 关闭编辑模态框
    window.closeEditModal = function() {
      $('#editModal').addClass('hidden');
      currentEditId = null;
    };

    // 保存编辑
    $('#saveEditBtn').click(async function() {
      if (!currentEditId) return;

      const token = $('#editToken').val().trim();
      const remark = $('#editRemark').val().trim();
      const enabled = $('#editEnabled').val() === 'true';

      if (!token) {
        showToast('Token 不能为空', 'error');
        return;
      }

      const btn = $(this);
      btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

      try {
        const response = await fetch(\`/api/configs/\${currentEditId}\`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ token, enabled, remark })
        });

        const result = await response.json();

        if (result.success) {
          showToast('更新成功', 'success');
          closeEditModal();
          loadConfigs();
        } else {
          showToast('更新失败: ' + result.error, 'error');
        }
      } catch (error) {
        showToast('请求失败: ' + error.message, 'error');
      } finally {
        btn.prop('disabled', false).html('<i class="fas fa-save mr-1"></i>保存');
      }
    });

    // 点击模态框外部关闭
    $('#editModal').click(function(e) {
      if (e.target === this) {
        closeEditModal();
      }
    });

    // 切换启用状态
    window.toggleKey = async function(id, enabled) {
      try {
        const response = await fetch(\`/api/configs/\${id}\`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ enabled })
        });

        const result = await response.json();

        if (result.success) {
          showToast(enabled ? '已启用密钥' : '已禁用密钥', 'success');
          loadConfigs(); // 重新加载以更新统计
        } else {
          showToast('更新失败: ' + result.error, 'error');
          loadConfigs(); // 重新加载
        }
      } catch (error) {
        showToast('请求失败: ' + error.message, 'error');
      }
    };

    // 删除配置
    window.deleteKey = async function(id) {
      if (!confirm('⚠️ 确定要删除此配置吗？此操作无法撤销！')) {
        return;
      }

      try {
        const response = await fetch(\`/api/configs/\${id}\`, {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + authToken
          }
        });

        const result = await response.json();

        if (result.success) {
          loadConfigs();
          showToast('配置已删除', 'success');
        } else {
          showToast('删除失败: ' + result.error, 'error');
        }
      } catch (error) {
        showToast('请求失败: ' + error.message, 'error');
      }
    };

    // 工具函数
    function maskToken(token) {
      if (!token) return '';
      if (token.length <= 10) return token;
      return token.substring(0, 8) + '...' + token.substring(token.length - 4);
    }

    // 复制 token 到剪贴板
    window.copyToken = function(token) {
      if (!token) {
        showToast('无效的 token', 'error');
        return;
      }

      navigator.clipboard.writeText(token).then(() => {
        showToast('✓ Token 已复制到剪贴板', 'success');
      }).catch(() => {
        // 兼容旧浏览器：使用备选方案
        const textarea = document.createElement('textarea');
        textarea.value = token;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('✓ Token 已复制到剪贴板', 'success');
      });
    }

    function formatDate(dateString) {
      if (!dateString) return '-';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      const pad = (n) => n.toString().padStart(2, '0');
      return \`\${date.getFullYear()}-\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(date.getSeconds())}\`;
    }

    // HTML 转义函数，防止 XSS
    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
    }

    function showLoginPanel() {
      $('#loginPanel').removeClass('hidden');
      $('#adminPanel').addClass('hidden');
    }

    function showAdminPanel() {
      $('#loginPanel').addClass('hidden');
      $('#adminPanel').removeClass('hidden');
      checkSystemStatus();
      loadConfigs();
    }

    // 检查系统状态
    async function checkSystemStatus() {
      const btn = $('#testDbBtn');
      btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i>检测中...');

      try {
        const response = await fetch('/api/status', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await response.json();

        if (result.success) {
          isDatabaseMode = result.database_configured && result.database_connected;
          updateStorageModeUI(result);
        } else {
          updateStorageModeUI({ storage_mode: 'passthrough', database_configured: false, database_connected: false });
        }
      } catch (error) {
        updateStorageModeUI({ storage_mode: 'passthrough', database_configured: false, database_connected: false, database_error: error.message });
      } finally {
        btn.prop('disabled', false).html('<i class="fas fa-plug mr-1"></i>测试连接');
      }
    }

    // 更新存储模式 UI
    function updateStorageModeUI(status) {
      const modeText = $('#storageMode');
      const modeIcon = $('#storageModeIcon');
      const dbStatusText = $('#dbStatusText');
      const addCard = $('.add-config-card');

      if (status.database_configured && status.database_connected) {
        // 数据库模式 - 已连接
        modeText.text('数据库模式').removeClass('text-gray-800 text-yellow-600').addClass('text-green-600');
        modeIcon.removeClass('bg-gray-100 bg-yellow-100').addClass('bg-green-100')
          .html('<i class="fas fa-database text-green-600 text-2xl"></i>');
        dbStatusText.html('<i class="fas fa-check-circle text-green-500 mr-1"></i>Supabase 已连接');
        setDatabaseModeEnabled(true);
      } else if (status.database_configured && !status.database_connected) {
        // 数据库模式 - 连接失败
        modeText.text('数据库模式').removeClass('text-gray-800 text-green-600').addClass('text-yellow-600');
        modeIcon.removeClass('bg-gray-100 bg-green-100').addClass('bg-yellow-100')
          .html('<i class="fas fa-exclamation-triangle text-yellow-600 text-2xl"></i>');
        dbStatusText.html('<i class="fas fa-times-circle text-red-500 mr-1"></i>连接失败: ' + (status.database_error || '未知错误'));
        setDatabaseModeEnabled(false);
      } else {
        // 直传模式
        modeText.text('直传模式').removeClass('text-green-600 text-yellow-600').addClass('text-gray-800');
        modeIcon.removeClass('bg-green-100 bg-yellow-100').addClass('bg-gray-100')
          .html('<i class="fas fa-bolt text-gray-600 text-2xl"></i>');
        dbStatusText.html('<i class="fas fa-info-circle text-blue-500 mr-1"></i>未配置数据库，仅支持直传 Token');
        setDatabaseModeEnabled(false);
      }
    }

    // 设置数据库模式功能启用/禁用
    function setDatabaseModeEnabled(enabled) {
      isDatabaseMode = enabled;
      const addBtn = $('#addBtn');
      const addInputs = $('#newApiUrl, #newToken, #newEnabled');

      if (enabled) {
        addBtn.prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
        addInputs.prop('disabled', false).removeClass('bg-gray-100');
        $('#addConfigNotice').remove();
      } else {
        addBtn.prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
        addInputs.prop('disabled', true).addClass('bg-gray-100');
        if ($('#addConfigNotice').length === 0) {
          $('#addBtn').after('<p id="addConfigNotice" class="text-xs text-yellow-600 mt-2"><i class="fas fa-info-circle mr-1"></i>需要配置数据库才能添加 Token</p>');
        }
      }
    }

    function showError(msg) {
      $('#loginError').text(msg).removeClass('hidden');
      setTimeout(() => $('#loginError').addClass('hidden'), 3000);
    }

    function showToast(message, type = 'success') {
      const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
      };

      const toast = $(\`
        <div class="toast toast-\${type}">
          <i class="fas \${icons[type]} mr-2"></i>
          \${message}
        </div>
      \`);

      $('body').append(toast);

      setTimeout(() => {
        toast.fadeOut(300, function() {
          $(this).remove();
        });
      }, 3000);
    }
  </script>
</body>
</html>`;
}
