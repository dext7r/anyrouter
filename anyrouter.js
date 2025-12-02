// AnyRouter - API Proxy Service
// Built at: 2025-12-02T13:55:08.917Z
// https://github.com/dext7r/anyrouter

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config.js
var config_exports = {};
__export(config_exports, {
  BUILD_TIME: () => BUILD_TIME,
  CACHE_KEY: () => CACHE_KEY,
  CONFIG_CACHE_TTL_MS: () => CONFIG_CACHE_TTL_MS,
  DEFAULT_ADMIN_PASSWORD: () => DEFAULT_ADMIN_PASSWORD,
  FALLBACK_CONFIG: () => FALLBACK_CONFIG,
  KV_CACHE_TTL_SECONDS: () => KV_CACHE_TTL_SECONDS,
  REDIS_CACHE_TTL_SECONDS: () => REDIS_CACHE_TTL_SECONDS
});
var BUILD_TIME, FALLBACK_CONFIG, CONFIG_CACHE_TTL_MS, REDIS_CACHE_TTL_SECONDS, KV_CACHE_TTL_SECONDS, CACHE_KEY, DEFAULT_ADMIN_PASSWORD;
var init_config = __esm({
  "src/config.js"() {
    BUILD_TIME = "2025-12-02T13:55:08.917Z";
    FALLBACK_CONFIG = {};
    CONFIG_CACHE_TTL_MS = 10 * 60 * 1e3;
    REDIS_CACHE_TTL_SECONDS = 5 * 60;
    KV_CACHE_TTL_SECONDS = 5 * 60;
    CACHE_KEY = "anyrouter:api_configs";
    DEFAULT_ADMIN_PASSWORD = "123456";
  }
});

// src/utils/helpers.js
init_config();
function getAdminPassword(env) {
  return env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}
function verifyAdmin(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.substring(7).trim();
  return token === getAdminPassword(env).trim();
}
function isValidUrl(apiUrl) {
  if (typeof apiUrl !== "string" || apiUrl.length === 0) {
    return false;
  }
  try {
    const parsed = new URL(apiUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
function isValidToken(token) {
  return typeof token === "string" && token.length > 0 && token.length <= 1e3 && !/[\s\0\n\r]/.test(token);
}
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
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
function handleCORS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

// src/db/supabase.js
init_config();

// src/cache/index.js
init_config();

// src/cache/redis.js
var RedisClient = class {
  constructor(url, token) {
    this.baseUrl = url;
    this.token = token;
  }
  async request(command) {
    const response = await fetch(`${this.baseUrl}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  }
  async get(key) {
    return this.request(["GET", key]);
  }
  async set(key, value, ttlSeconds) {
    if (ttlSeconds) {
      return this.request(["SET", key, value, "EX", ttlSeconds]);
    }
    return this.request(["SET", key, value]);
  }
  async del(key) {
    return this.request(["DEL", key]);
  }
};
function getRedisClient(env) {
  if (!env.UPSTASH_REDIS_URL || !env.UPSTASH_REDIS_TOKEN) {
    return null;
  }
  return new RedisClient(env.UPSTASH_REDIS_URL, env.UPSTASH_REDIS_TOKEN);
}

// src/cache/index.js
var configCache = { value: null, expiresAt: 0 };
function getCachedConfig() {
  if (configCache.value && configCache.expiresAt > Date.now()) {
    return configCache.value;
  }
  return null;
}
function setConfigCache(config) {
  configCache = {
    value: config,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS
  };
}
async function invalidateAllCache(env) {
  configCache = { value: null, expiresAt: 0 };
  const redis = getRedisClient(env);
  if (redis) {
    try {
      await redis.del(CACHE_KEY);
    } catch {
    }
  }
  if (env && env.CONFIG_KV) {
    try {
      await env.CONFIG_KV.delete(CACHE_KEY);
    } catch {
    }
  }
}
async function warmupCache(env) {
  const result = { success: false, cached: [], keysCount: 0 };
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { ...result, error: "Database not configured" };
  }
  try {
    let response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?select=*&deleted_at=is.null&order=created_at.desc`,
      {
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`
        }
      }
    );
    if (!response.ok) {
      response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/api_configs?select=*&order=created_at.desc`,
        {
          headers: {
            apikey: env.SUPABASE_KEY,
            Authorization: `Bearer ${env.SUPABASE_KEY}`
          }
        }
      );
    }
    if (!response.ok) {
      return { ...result, error: `Database query failed: HTTP ${response.status}` };
    }
    const data = await response.json();
    const config = {};
    data.forEach((item) => {
      if (!config[item.api_url]) {
        config[item.api_url] = { keys: [] };
      }
      config[item.api_url].keys.push({
        id: item.id,
        key_id: item.key_id,
        token: item.token,
        enabled: item.enabled,
        remark: item.remark || "",
        created_at: item.created_at,
        updated_at: item.updated_at
      });
    });
    result.keysCount = data.length;
    setConfigCache(config);
    result.cached.push("memory");
    const redis = getRedisClient(env);
    if (redis) {
      try {
        const { REDIS_CACHE_TTL_SECONDS: REDIS_CACHE_TTL_SECONDS2 } = await Promise.resolve().then(() => (init_config(), config_exports));
        await redis.set(CACHE_KEY, JSON.stringify(config), REDIS_CACHE_TTL_SECONDS2);
        result.cached.push("redis");
      } catch (e) {
        result.redisError = e.message;
      }
    }
    if (env.CONFIG_KV) {
      try {
        const { KV_CACHE_TTL_SECONDS: KV_CACHE_TTL_SECONDS2 } = await Promise.resolve().then(() => (init_config(), config_exports));
        await env.CONFIG_KV.put(CACHE_KEY, JSON.stringify(config), {
          expirationTtl: KV_CACHE_TTL_SECONDS2
        });
        result.cached.push("kv");
      } catch (e) {
        result.kvError = e.message;
      }
    }
    result.success = true;
    return result;
  } catch (error) {
    return { ...result, error: error.message };
  }
}

// src/db/supabase.js
async function clearAllCache(env) {
  await invalidateAllCache(env);
}
async function getConfigFromDB(env) {
  const memoryCached = getCachedConfig();
  if (memoryCached) {
    return memoryCached;
  }
  const redis = getRedisClient(env);
  if (redis) {
    try {
      const redisCached = await redis.get(CACHE_KEY);
      if (redisCached) {
        const parsed = JSON.parse(redisCached);
        setConfigCache(parsed);
        return parsed;
      }
    } catch {
    }
  }
  if (env.CONFIG_KV) {
    try {
      const kvCached = await env.CONFIG_KV.get(CACHE_KEY, { type: "json" });
      if (kvCached) {
        setConfigCache(kvCached);
        return kvCached;
      }
    } catch {
    }
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    setConfigCache(FALLBACK_CONFIG);
    return FALLBACK_CONFIG;
  }
  try {
    let response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?select=*&deleted_at=is.null&order=created_at.desc`,
      {
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`
        }
      }
    );
    if (!response.ok) {
      response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/api_configs?select=*&order=created_at.desc`,
        {
          headers: {
            apikey: env.SUPABASE_KEY,
            Authorization: `Bearer ${env.SUPABASE_KEY}`
          }
        }
      );
    }
    if (!response.ok) {
      setConfigCache(FALLBACK_CONFIG);
      return FALLBACK_CONFIG;
    }
    const data = await response.json();
    const config = {};
    data.forEach((item) => {
      if (!config[item.api_url]) {
        config[item.api_url] = { keys: [] };
      }
      config[item.api_url].keys.push({
        id: item.id,
        key_id: item.key_id,
        sk_alias: item.sk_alias || null,
        token: item.token,
        enabled: item.enabled,
        remark: item.remark || "",
        expires_at: item.expires_at || null,
        created_at: item.created_at,
        updated_at: item.updated_at
      });
    });
    const finalizedConfig = Object.keys(config).length > 0 ? config : FALLBACK_CONFIG;
    setConfigCache(finalizedConfig);
    if (redis) {
      redis.set(CACHE_KEY, JSON.stringify(finalizedConfig), REDIS_CACHE_TTL_SECONDS).catch(() => {
      });
    }
    if (env.CONFIG_KV) {
      env.CONFIG_KV.put(CACHE_KEY, JSON.stringify(finalizedConfig), {
        expirationTtl: KV_CACHE_TTL_SECONDS
      }).catch(() => {
      });
    }
    return finalizedConfig;
  } catch {
    setConfigCache(FALLBACK_CONFIG);
    return FALLBACK_CONFIG;
  }
}
async function saveConfigToDB(env, apiUrl, token, enabled, remark = "", expiresAt = null) {
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
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        api_url: apiUrl,
        token,
        enabled,
        remark: remark || null,
        expires_at: expiresAt || null
      })
    });
    if (!response.ok) {
      return { success: false, error: await response.text() };
    }
    await clearAllCache(env);
    return { success: true, data: await response.json() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
async function updateConfigInDB(env, id, updates) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: "Database not configured" };
  }
  try {
    const data = { ...updates, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      }
    );
    if (!response.ok) {
      return { success: false, error: await response.text() };
    }
    await clearAllCache(env);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
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
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          deleted_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      }
    );
    if (!response.ok) {
      return { success: false, error: await response.text() };
    }
    await clearAllCache(env);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
function generateSkAlias() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "sk-ar-";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
async function updateSkAlias(env, id, skAlias = null) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: "Database not configured" };
  }
  const newAlias = skAlias || generateSkAlias();
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          sk_alias: newAlias,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      }
    );
    if (!response.ok) {
      return { success: false, error: await response.text() };
    }
    await clearAllCache(env);
    return { success: true, sk_alias: newAlias };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
function findBySkAlias(config, skAlias) {
  for (const [apiUrl, apiConfig] of Object.entries(config)) {
    if (!apiConfig.keys) continue;
    const key = apiConfig.keys.find((k) => k.sk_alias === skAlias);
    if (key) {
      return { apiUrl, key };
    }
  }
  return null;
}

// src/cache/stats.js
var STATS_PREFIX = "anyrouter:stats";
var BLACKLIST_KEY = "anyrouter:blacklist:ips";
var STATS_SAMPLE_PERCENT = 100;
function getTodayKey() {
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
function getHourKey() {
  const now = /* @__PURE__ */ new Date();
  return `${now.toISOString().split("T")[0]}-${now.getUTCHours().toString().padStart(2, "0")}`;
}
async function recordRequest(env, data) {
  const redis = getRedisClient(env);
  if (!redis) return;
  const shouldRecord = Math.random() * 100 < STATS_SAMPLE_PERCENT;
  if (!shouldRecord) return;
  const multiplier = Math.round(100 / STATS_SAMPLE_PERCENT);
  const { apiUrl, keyId, success, ip } = data;
  const today = getTodayKey();
  const hour = getHourKey();
  try {
    await redis.request(["INCRBY", `${STATS_PREFIX}:daily:${today}:total`, multiplier]);
    await redis.request(["INCRBY", `${STATS_PREFIX}:daily:${today}:${success ? "success" : "error"}`, multiplier]);
    await redis.request(["INCRBY", `${STATS_PREFIX}:hourly:${hour}:total`, multiplier]);
    if (apiUrl) {
      await redis.request(["HINCRBY", `${STATS_PREFIX}:daily:${today}:urls`, apiUrl, multiplier]);
    }
    if (keyId) {
      await redis.request(["HINCRBY", `${STATS_PREFIX}:daily:${today}:keys`, keyId, multiplier]);
      await redis.request(["HSET", `${STATS_PREFIX}:lastused`, keyId, (/* @__PURE__ */ new Date()).toISOString()]);
    }
    if (ip && ip !== "unknown") {
      await redis.request(["HINCRBY", `${STATS_PREFIX}:daily:${today}:ips`, ip, multiplier]);
    }
    const ttl = 7 * 24 * 60 * 60;
    await redis.request(["EXPIRE", `${STATS_PREFIX}:daily:${today}:total`, ttl]);
    await redis.request(["EXPIRE", `${STATS_PREFIX}:hourly:${hour}:total`, ttl]);
  } catch {
  }
}
async function getStats(env, days = 7) {
  const redis = getRedisClient(env);
  if (!redis) {
    return { enabled: false, message: "Redis not configured" };
  }
  try {
    const stats = {
      enabled: true,
      daily: [],
      hourly: [],
      topUrls: {},
      topKeys: {},
      topIps: {},
      summary: { total: 0, success: 0, error: 0 }
    };
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split("T")[0]);
    }
    for (const date of dates) {
      const total = await redis.get(`${STATS_PREFIX}:daily:${date}:total`) || 0;
      const success = await redis.get(`${STATS_PREFIX}:daily:${date}:success`) || 0;
      const error = await redis.get(`${STATS_PREFIX}:daily:${date}:error`) || 0;
      stats.daily.push({
        date,
        total: parseInt(total),
        success: parseInt(success),
        error: parseInt(error)
      });
      stats.summary.total += parseInt(total);
      stats.summary.success += parseInt(success);
      stats.summary.error += parseInt(error);
    }
    const today = getTodayKey();
    const urlStats = await redis.request(["HGETALL", `${STATS_PREFIX}:daily:${today}:urls`]);
    if (urlStats && Array.isArray(urlStats)) {
      for (let i = 0; i < urlStats.length; i += 2) {
        stats.topUrls[urlStats[i]] = parseInt(urlStats[i + 1]);
      }
    }
    const keyStats = await redis.request(["HGETALL", `${STATS_PREFIX}:daily:${today}:keys`]);
    if (keyStats && Array.isArray(keyStats)) {
      for (let i = 0; i < keyStats.length; i += 2) {
        stats.topKeys[keyStats[i]] = parseInt(keyStats[i + 1]);
      }
    }
    const ipStats = await redis.request(["HGETALL", `${STATS_PREFIX}:daily:${today}:ips`]);
    if (ipStats && Array.isArray(ipStats)) {
      for (let i = 0; i < ipStats.length; i += 2) {
        stats.topIps[ipStats[i]] = parseInt(ipStats[i + 1]);
      }
    }
    for (let i = 0; i < 24; i++) {
      const d = /* @__PURE__ */ new Date();
      d.setHours(d.getHours() - i);
      const hourKey = `${d.toISOString().split("T")[0]}-${d.getUTCHours().toString().padStart(2, "0")}`;
      const hourTotal = await redis.get(`${STATS_PREFIX}:hourly:${hourKey}:total`) || 0;
      stats.hourly.push({
        hour: hourKey,
        total: parseInt(hourTotal)
      });
    }
    stats.daily.reverse();
    stats.hourly.reverse();
    return stats;
  } catch (error) {
    return { enabled: false, error: error.message };
  }
}
async function getLastUsedTimes(env) {
  const redis = getRedisClient(env);
  if (!redis) return {};
  try {
    const result = await redis.request(["HGETALL", `${STATS_PREFIX}:lastused`]);
    if (!result || !Array.isArray(result)) return {};
    const lastUsed = {};
    for (let i = 0; i < result.length; i += 2) {
      lastUsed[result[i]] = result[i + 1];
    }
    return lastUsed;
  } catch {
    return {};
  }
}
async function recordLogin(env, request) {
  const redis = getRedisClient(env);
  if (!redis) return;
  try {
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
    const userAgent = request.headers.get("User-Agent") || "unknown";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const record = JSON.stringify({ time: now, ip, ua: userAgent });
    await redis.request(["LPUSH", `${STATS_PREFIX}:logins`, record]);
    await redis.request(["LTRIM", `${STATS_PREFIX}:logins`, 0, 49]);
  } catch {
  }
}
async function getLoginRecords(env, limit = 20) {
  const redis = getRedisClient(env);
  if (!redis) return [];
  try {
    const records = await redis.request(["LRANGE", `${STATS_PREFIX}:logins`, 0, limit - 1]);
    if (!records || !Array.isArray(records)) return [];
    return records.map((r) => {
      try {
        return JSON.parse(r);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}
async function isIpBlocked(env, ip) {
  const redis = getRedisClient(env);
  if (!redis || !ip || ip === "unknown") return { blocked: false };
  try {
    const reason = await redis.request(["HGET", BLACKLIST_KEY, ip]);
    if (reason) {
      return { blocked: true, reason: reason || "\u5DF2\u88AB\u7BA1\u7406\u5458\u5C01\u7981" };
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}
async function blockIp(env, ip, reason = "\u624B\u52A8\u5C01\u7981") {
  const redis = getRedisClient(env);
  if (!redis) return { success: false, error: "Redis not configured" };
  try {
    const record = JSON.stringify({
      reason,
      blocked_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    await redis.request(["HSET", BLACKLIST_KEY, ip, record]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
async function unblockIp(env, ip) {
  const redis = getRedisClient(env);
  if (!redis) return { success: false, error: "Redis not configured" };
  try {
    await redis.request(["HDEL", BLACKLIST_KEY, ip]);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
async function getBlockedIps(env) {
  const redis = getRedisClient(env);
  if (!redis) return [];
  try {
    const result = await redis.request(["HGETALL", BLACKLIST_KEY]);
    if (!result || !Array.isArray(result)) return [];
    const blockedIps = [];
    for (let i = 0; i < result.length; i += 2) {
      const ip = result[i];
      let info = { reason: "\u624B\u52A8\u5C01\u7981", blocked_at: null };
      try {
        info = JSON.parse(result[i + 1]);
      } catch {
        info.reason = result[i + 1] || "\u624B\u52A8\u5C01\u7981";
      }
      blockedIps.push({ ip, ...info });
    }
    return blockedIps;
  } catch {
    return [];
  }
}

// src/handlers/api.js
async function handleApiRequest(request, env, url) {
  if (!verifyAdmin(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const path = url.pathname;
  if (path === "/api/configs" && request.method === "GET") {
    const config = await getConfigFromDB(env);
    const lastUsed = await getLastUsedTimes(env);
    return jsonResponse({ success: true, data: config, lastUsed });
  }
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
      body.remark || "",
      body.expires_at || null
    );
    return jsonResponse(result, result.success ? 200 : 400);
  }
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
  if (path.match(/^\/api\/configs\/\d+$/) && request.method === "DELETE") {
    const id = path.split("/").pop();
    const result = await deleteConfigFromDB(env, id);
    return jsonResponse(result, result.success ? 200 : 400);
  }
  if (path.match(/^\/api\/configs\/\d+\/sk-alias$/) && request.method === "POST") {
    const id = path.split("/")[3];
    const result = await updateSkAlias(env, id);
    return jsonResponse(result, result.success ? 200 : 400);
  }
  if (path.match(/^\/api\/configs\/\d+\/sk-alias$/) && request.method === "DELETE") {
    const id = path.split("/")[3];
    const result = await updateSkAlias(env, id, "");
    return jsonResponse(result, result.success ? 200 : 400);
  }
  if (path === "/api/status" && request.method === "GET") {
    const hasDbConfig = Boolean(env.SUPABASE_URL && env.SUPABASE_KEY);
    const result = {
      success: true,
      storage_mode: hasDbConfig ? "database" : "passthrough",
      database_configured: hasDbConfig,
      database_connected: false
    };
    if (hasDbConfig) {
      try {
        const response = await fetch(
          `${env.SUPABASE_URL}/rest/v1/api_configs?select=count&limit=1`,
          {
            headers: {
              apikey: env.SUPABASE_KEY,
              Authorization: `Bearer ${env.SUPABASE_KEY}`
            }
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
  if (path === "/api/login" && request.method === "POST") {
    await recordLogin(env, request);
    return jsonResponse({ success: true });
  }
  if (path === "/api/logins" && request.method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const records = await getLoginRecords(env, limit);
    return jsonResponse({ success: true, data: records });
  }
  if (path === "/api/stats" && request.method === "GET") {
    const days = parseInt(url.searchParams.get("days") || "7");
    const stats = await getStats(env, days);
    return jsonResponse({ success: true, data: stats });
  }
  if (path === "/api/blacklist" && request.method === "GET") {
    const blockedIps = await getBlockedIps(env);
    return jsonResponse({ success: true, data: blockedIps });
  }
  if (path === "/api/blacklist" && request.method === "POST") {
    const body = await request.json();
    if (!body.ip) {
      return jsonResponse({ error: "IP address is required" }, 400);
    }
    const result = await blockIp(env, body.ip, body.reason || "\u624B\u52A8\u5C01\u7981");
    return jsonResponse(result, result.success ? 200 : 400);
  }
  if (path.startsWith("/api/blacklist/") && request.method === "DELETE") {
    const ip = decodeURIComponent(path.replace("/api/blacklist/", ""));
    if (!ip) {
      return jsonResponse({ error: "IP address is required" }, 400);
    }
    const result = await unblockIp(env, ip);
    return jsonResponse(result, result.success ? 200 : 400);
  }
  if (path === "/api/redis/test" && request.method === "GET") {
    const redis = getRedisClient(env);
    if (!redis) {
      return jsonResponse({
        success: false,
        configured: false,
        error: "Redis not configured (missing UPSTASH_REDIS_URL or UPSTASH_REDIS_TOKEN)"
      });
    }
    try {
      const testKey = "anyrouter:test:ping";
      const testValue = Date.now().toString();
      await redis.set(testKey, testValue, 60);
      const readValue = await redis.get(testKey);
      await redis.del(testKey);
      return jsonResponse({
        success: true,
        configured: true,
        connected: true,
        latency_test: readValue === testValue ? "passed" : "failed",
        message: "Redis connection successful"
      });
    } catch (error) {
      return jsonResponse({
        success: false,
        configured: true,
        connected: false,
        error: error.message
      });
    }
  }
  if (path === "/api/cache/warmup" && request.method === "POST") {
    const result = await warmupCache(env);
    return jsonResponse(result, result.success ? 200 : 400);
  }
  if (path === "/api/stats/test" && request.method === "POST") {
    const redis = getRedisClient(env);
    if (!redis) {
      return jsonResponse({ success: false, error: "Redis not configured" });
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const key = `anyrouter:stats:daily:${today}:total`;
    try {
      const result = await redis.request(["INCR", key]);
      await redis.request(["EXPIRE", key, 604800]);
      return jsonResponse({
        success: true,
        message: "\u5199\u5165\u6210\u529F",
        key,
        newValue: result
      });
    } catch (error) {
      return jsonResponse({ success: false, error: error.message, stack: error.stack });
    }
  }
  return jsonResponse({ error: "Not found" }, 404);
}

// src/handlers/proxy.js
function errorResponse(code, message, hint) {
  return jsonResponse({
    error: {
      code,
      message,
      hint,
      contact: "\u5982\u6709\u7591\u95EE\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458"
    }
  }, code === "UNAUTHORIZED" ? 401 : code === "BAD_REQUEST" ? 400 : code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : code === "SERVICE_ERROR" ? 503 : 500);
}
async function handleProxyRequest(request, env, url, ctx) {
  const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  const blockCheck = await isIpBlocked(env, clientIp);
  if (blockCheck.blocked) {
    return jsonResponse({
      error: {
        code: "IP_BLOCKED",
        message: "IP \u5DF2\u88AB\u5C01\u7981",
        reason: blockCheck.reason,
        ip: clientIp,
        contact: "\u5982\u6709\u7591\u95EE\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458"
      }
    }, 403);
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse(
      "UNAUTHORIZED",
      "\u7F3A\u5C11\u6388\u6743\u4FE1\u606F",
      "\u8BF7\u5728 Authorization header \u4E2D\u63D0\u4F9B Bearer token\uFF0C\u683C\u5F0F: Bearer <API_URL>:<Key ID> \u6216 Bearer sk-ar-xxx"
    );
  }
  const authValue = authHeader.substring(7).trim();
  const config = await getConfigFromDB(env);
  let tokenToUse;
  let targetApiUrl;
  let usedKeyId = null;
  if (authValue.startsWith("sk-ar-")) {
    const found = findBySkAlias(config, authValue);
    if (!found) {
      return errorResponse(
        "NOT_FOUND",
        "SK \u522B\u540D\u4E0D\u5B58\u5728",
        `\u627E\u4E0D\u5230 SK \u522B\u540D "${authValue}"\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u8F93\u5165\u6B63\u786E\u6216\u8054\u7CFB\u7BA1\u7406\u5458\u83B7\u53D6\u6709\u6548\u7684 SK`
      );
    }
    if (!found.key.enabled) {
      return errorResponse(
        "FORBIDDEN",
        "SK \u5DF2\u88AB\u7981\u7528",
        "\u6B64 SK \u522B\u540D\u5F53\u524D\u5904\u4E8E\u7981\u7528\u72B6\u6001\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u542F\u7528"
      );
    }
    if (found.key.expires_at && new Date(found.key.expires_at) < /* @__PURE__ */ new Date()) {
      return errorResponse(
        "FORBIDDEN",
        "SK \u5DF2\u8FC7\u671F",
        `\u6B64 SK \u522B\u540D\u5DF2\u4E8E ${found.key.expires_at} \u8FC7\u671F\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u7EED\u671F\u6216\u83B7\u53D6\u65B0\u7684 SK`
      );
    }
    tokenToUse = found.key.token;
    targetApiUrl = found.apiUrl;
    usedKeyId = found.key.key_id;
  } else {
    const lastColonIndex = authValue.lastIndexOf(":");
    if (lastColonIndex === -1 || lastColonIndex < 8) {
      return errorResponse(
        "BAD_REQUEST",
        "\u6388\u6743\u683C\u5F0F\u9519\u8BEF",
        "\u6B63\u786E\u683C\u5F0F: <API_URL>:<Key ID> \u6216 sk-ar-xxx\uFF0C\u4F8B\u5982 https://api.openai.com:a3x9k2"
      );
    }
    targetApiUrl = authValue.substring(0, lastColonIndex);
    const keyPart = authValue.substring(lastColonIndex + 1);
    if (!targetApiUrl.startsWith("http://") && !targetApiUrl.startsWith("https://")) {
      return errorResponse(
        "BAD_REQUEST",
        "API URL \u683C\u5F0F\u65E0\u6548",
        "URL \u5FC5\u987B\u4EE5 http:// \u6216 https:// \u5F00\u5934"
      );
    }
    if (!keyPart) {
      return errorResponse(
        "BAD_REQUEST",
        "\u7F3A\u5C11 Key ID \u6216 Token",
        "\u8BF7\u5728 URL \u540E\u9762\u52A0\u4E0A\u5192\u53F7\u548C Key ID\uFF086\u4F4D\uFF09\u6216\u5B8C\u6574 Token"
      );
    }
    const isKeyId = /^[a-z0-9]{6}$/.test(keyPart);
    if (isKeyId) {
      const keyId = keyPart;
      usedKeyId = keyId;
      if (!config[targetApiUrl]) {
        return errorResponse(
          "NOT_FOUND",
          "API \u5730\u5740\u672A\u914D\u7F6E",
          `\u76EE\u6807 API "${targetApiUrl}" \u5C1A\u672A\u5728\u7CFB\u7EDF\u4E2D\u6CE8\u518C\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u6DFB\u52A0\u914D\u7F6E`
        );
      }
      const keyConfig = config[targetApiUrl].keys.find((k) => k.key_id === keyId);
      if (!keyConfig) {
        return errorResponse(
          "NOT_FOUND",
          "Key ID \u4E0D\u5B58\u5728",
          `\u627E\u4E0D\u5230 Key ID "${keyId}"\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u8F93\u5165\u6B63\u786E\u6216\u8054\u7CFB\u7BA1\u7406\u5458\u83B7\u53D6\u6709\u6548\u7684 Key ID`
        );
      }
      if (!keyConfig.enabled) {
        return errorResponse(
          "FORBIDDEN",
          "Key \u5DF2\u88AB\u7981\u7528",
          `Key ID "${keyId}" \u5F53\u524D\u5904\u4E8E\u7981\u7528\u72B6\u6001\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u542F\u7528\u6216\u83B7\u53D6\u65B0\u7684 Key ID`
        );
      }
      if (keyConfig.expires_at && new Date(keyConfig.expires_at) < /* @__PURE__ */ new Date()) {
        return errorResponse(
          "FORBIDDEN",
          "Key \u5DF2\u8FC7\u671F",
          `Key ID "${keyId}" \u5DF2\u4E8E ${keyConfig.expires_at} \u8FC7\u671F\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u7EED\u671F\u6216\u83B7\u53D6\u65B0\u7684 Key ID`
        );
      }
      tokenToUse = keyConfig.token;
    } else {
      tokenToUse = keyPart;
    }
  }
  const targetUrl = new URL(targetApiUrl);
  const selfHostname = url.hostname.toLowerCase();
  const targetHostname = targetUrl.hostname.toLowerCase();
  if (targetHostname === selfHostname || targetHostname.endsWith("." + selfHostname) || selfHostname.endsWith("." + targetHostname)) {
    return errorResponse(
      "FORBIDDEN",
      "\u7981\u6B62\u53CD\u4EE3\u81EA\u8EAB",
      "\u4E0D\u5141\u8BB8\u5C06\u8BF7\u6C42\u4EE3\u7406\u5230\u4EE3\u7406\u670D\u52A1\u81EA\u8EAB\u7684\u57DF\u540D\uFF0C\u8FD9\u4F1A\u9020\u6210\u5FAA\u73AF\u8BF7\u6C42"
    );
  }
  url.protocol = targetUrl.protocol;
  url.hostname = targetUrl.hostname;
  url.port = targetUrl.port || "";
  const headers = new Headers(request.headers);
  headers.set("authorization", "Bearer " + tokenToUse);
  const modifiedRequest = new Request(url.toString(), {
    headers,
    method: request.method,
    body: request.body,
    redirect: "follow"
  });
  try {
    const response = await fetch(modifiedRequest);
    const modifiedResponse = new Response(response.body, response);
    modifiedResponse.headers.set("Access-Control-Allow-Origin", "*");
    const contentType = response.headers.get("content-type") || "";
    const isStreaming = contentType.includes("text/event-stream") || contentType.includes("stream") || request.headers.get("accept")?.includes("text/event-stream");
    if (isStreaming) {
      modifiedResponse.headers.set("Cache-Control", "no-cache, no-store, no-transform, must-revalidate");
      modifiedResponse.headers.set("X-Accel-Buffering", "no");
      modifiedResponse.headers.set("Connection", "keep-alive");
      modifiedResponse.headers.set("Content-Encoding", "identity");
      modifiedResponse.headers.delete("Content-Length");
    }
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(recordRequest(env, {
        apiUrl: targetApiUrl,
        keyId: usedKeyId,
        success: response.ok,
        ip: clientIp
      }));
    }
    return modifiedResponse;
  } catch (error) {
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(recordRequest(env, {
        apiUrl: targetApiUrl,
        keyId: usedKeyId,
        success: false,
        ip: clientIp
      }));
    }
    console.error("Proxy request error:", error);
    return errorResponse(
      "SERVICE_ERROR",
      "\u4EE3\u7406\u8BF7\u6C42\u5931\u8D25",
      `\u65E0\u6CD5\u8FDE\u63A5\u5230\u76EE\u6807 API "${targetApiUrl}"\uFF0C\u53EF\u80FD\u662F\u7F51\u7EDC\u95EE\u9898\u6216\u76EE\u6807\u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5`
    );
  }
}

// src/pages/status.js
init_config();
function getStatusHtml() {
  const buildTimeFormatted = new Date(BUILD_TIME).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
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
    <p class="tagline">\u8F7B\u91CF\u7EA7 API \u4EE3\u7406\u670D\u52A1</p>
    <div class="status"><i class="fas fa-circle"></i> \u670D\u52A1\u8FD0\u884C\u4E2D</div>
    <div class="features">
      <div class="feature"><i class="fas fa-globe"></i><span>\u591A\u7AEF\u70B9\u4EE3\u7406</span></div>
      <div class="feature"><i class="fas fa-key"></i><span>Token \u7BA1\u7406</span></div>
      <div class="feature"><i class="fas fa-shield-alt"></i><span>\u5B89\u5168\u8F6C\u53D1</span></div>
      <div class="feature"><i class="fas fa-bolt"></i><span>\u8FB9\u7F18\u52A0\u901F</span></div>
    </div>
    <div class="buttons">
      <a href="/docs" class="btn btn-primary"><i class="fas fa-book"></i>\u4F7F\u7528\u6587\u6863</a>
      <a href="/admin" class="btn btn-secondary"><i class="fas fa-cog"></i>\u7BA1\u7406\u9762\u677F</a>
      <a href="https://github.com/dext7r/anyrouter" target="_blank" class="btn btn-secondary"><i class="fab fa-github"></i>GitHub</a>
    </div>
  </div>
  <div class="footer">
    <div>Powered by <a href="https://workers.cloudflare.com" target="_blank">Cloudflare Workers</a></div>
    <div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">
      <i class="fas fa-clock"></i> \u90E8\u7F72\u65F6\u95F4: ${buildTimeFormatted}
    </div>
  </div>
</body>
</html>`;
}

// src/pages/admin.js
function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Proxy Admin</title>
  <script src="https://code.jquery.com/jquery-3.7.1.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .glass-effect { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.3); }
    .card-hover { transition: all 0.3s ease; }
    .card-hover:hover { transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); transition: all 0.3s ease; }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4); }
    .animate-fade-in { animation: fadeIn 0.5s ease-in; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .toast { position: fixed; top: 20px; right: 20px; padding: 16px 24px; border-radius: 12px; color: white; font-weight: 500; box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 9999; animation: slideIn 0.3s ease-out; }
    @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    .toast-success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
    .toast-error { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
    .toast-info { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
    .mini-input { padding: 6px 10px !important; font-size: 13px !important; }
    .mini-btn { padding: 6px 12px !important; font-size: 12px !important; }
    .mini-table th, .mini-table td { padding: 8px 10px !important; font-size: 12px !important; }
    .mini-card { padding: 16px !important; }
    .remark-cell { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
          <h2 class="text-3xl font-bold text-gray-800 mb-2">\u7BA1\u7406\u5458\u767B\u5F55</h2>
          <p class="text-gray-500">\u8F93\u5165\u5BC6\u7801\u4EE5\u8BBF\u95EE\u7BA1\u7406\u9762\u677F</p>
        </div>
        <div class="space-y-5">
          <div class="relative">
            <i class="fas fa-key absolute left-4 top-4 text-gray-400"></i>
            <input type="password" id="passwordInput" placeholder="\u8BF7\u8F93\u5165\u7BA1\u7406\u5458\u5BC6\u7801" class="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 transition-all">
          </div>
          <button id="loginBtn" class="w-full py-3 btn-primary text-white rounded-xl font-semibold shadow-lg"><i class="fas fa-sign-in-alt mr-2"></i>\u767B\u5F55</button>
          <div id="loginError" class="text-red-500 text-sm text-center hidden"></div>
        </div>
      </div>
    </div>

    <!-- Admin Panel -->
    <div id="adminPanel" class="hidden animate-fade-in">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-4xl font-bold text-white mb-2"><i class="fas fa-rocket mr-3"></i>API Proxy \u7BA1\u7406\u4E2D\u5FC3</h1>
          <p class="text-purple-100">\u7BA1\u7406\u4F60\u7684 API \u7AEF\u70B9\u548C\u5BC6\u94A5\u914D\u7F6E</p>
        </div>
        <div class="flex gap-3">
          <a href="/docs" class="glass-effect px-6 py-3 text-purple-700 rounded-xl hover:bg-white transition-all font-semibold shadow-lg"><i class="fas fa-book mr-2"></i>\u6587\u6863</a>
          <a href="https://github.com/dext7r/anyrouter" target="_blank" class="glass-effect px-6 py-3 text-purple-700 rounded-xl hover:bg-white transition-all font-semibold shadow-lg"><i class="fab fa-github mr-2"></i>GitHub</a>
          <button id="logoutBtn" class="glass-effect px-6 py-3 text-purple-700 rounded-xl hover:bg-white transition-all font-semibold shadow-lg"><i class="fas fa-sign-out-alt mr-2"></i>\u9000\u51FA\u767B\u5F55</button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div id="statsCards" class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div class="glass-effect rounded-2xl p-4 card-hover">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-gray-500 text-xs font-medium mb-1">\u5B58\u50A8\u6A21\u5F0F</p>
              <h3 id="storageMode" class="text-sm font-bold text-gray-800">\u68C0\u6D4B\u4E2D...</h3>
            </div>
            <div id="storageModeIcon" class="p-3 bg-gray-100 rounded-xl"><i class="fas fa-circle-notch fa-spin text-gray-400 text-xl"></i></div>
          </div>
          <div id="dbStatus" class="text-xs text-gray-500"><span id="dbStatusText">\u6B63\u5728\u68C0\u6D4B...</span></div>
        </div>
        <div class="glass-effect rounded-2xl p-4 card-hover">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-gray-500 text-xs font-medium mb-1">Redis \u7F13\u5B58</p>
              <h3 id="redisStatus" class="text-sm font-bold text-gray-800">\u68C0\u6D4B\u4E2D...</h3>
            </div>
            <div id="redisIcon" class="p-3 bg-gray-100 rounded-xl"><i class="fas fa-circle-notch fa-spin text-gray-400 text-xl"></i></div>
          </div>
          <div id="redisStatusText" class="text-xs text-gray-500">\u6B63\u5728\u68C0\u6D4B...</div>
        </div>
        <div class="glass-effect rounded-2xl p-4 card-hover">
          <div class="flex items-center justify-between">
            <div><p class="text-gray-500 text-xs font-medium mb-1">API \u6570\u91CF</p><h3 id="totalApis" class="text-2xl font-bold text-gray-800">0</h3></div>
            <div class="p-4 bg-blue-100 rounded-xl"><i class="fas fa-server text-blue-600 text-2xl"></i></div>
          </div>
        </div>
        <div class="glass-effect rounded-2xl p-6 card-hover">
          <div class="flex items-center justify-between">
            <div><p class="text-gray-500 text-sm font-medium mb-1">\u603B\u5BC6\u94A5\u6570</p><h3 id="totalKeys" class="text-3xl font-bold text-gray-800">0</h3></div>
            <div class="p-4 bg-purple-100 rounded-xl"><i class="fas fa-key text-purple-600 text-2xl"></i></div>
          </div>
        </div>
        <div class="glass-effect rounded-2xl p-6 card-hover">
          <div class="flex items-center justify-between">
            <div><p class="text-gray-500 text-sm font-medium mb-1">\u5DF2\u542F\u7528</p><h3 id="enabledKeys" class="text-3xl font-bold text-green-600">0</h3></div>
            <div class="p-4 bg-green-100 rounded-xl"><i class="fas fa-check-circle text-green-600 text-2xl"></i></div>
          </div>
        </div>
      </div>

      <!-- Stats Charts -->
      <div id="statsCharts" class="glass-effect rounded-2xl shadow-xl mb-6 overflow-hidden">
        <div class="p-4 cursor-pointer flex items-center justify-between hover:bg-purple-50 transition-all" onclick="toggleStats()">
          <h2 class="text-lg font-bold text-gray-800"><i class="fas fa-chart-line mr-2 text-purple-600"></i>\u8BF7\u6C42\u7EDF\u8BA1</h2>
          <div class="flex gap-2 items-center">
            <span id="statsSummary" class="text-xs text-gray-500"></span>
            <button id="refreshStatsBtn" class="mini-btn bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200" onclick="event.stopPropagation(); loadStats(true);"><i class="fas fa-sync-alt"></i></button>
            <i id="statsToggle" class="fas fa-chevron-down text-purple-600 transition-transform"></i>
          </div>
        </div>
        <div id="statsContent" class="hidden border-t border-purple-100">
          <div class="p-4">
            <!-- \u7A7A\u72B6\u6001\u5C55\u793A -->
            <div id="statsEmpty" class="hidden text-center py-8">
              <div class="text-gray-300 mb-4"><i class="fas fa-chart-area text-6xl"></i></div>
              <h3 class="text-lg font-medium text-gray-500 mb-2">\u6682\u65E0\u7EDF\u8BA1\u6570\u636E</h3>
              <p id="statsEmptyText" class="text-sm text-gray-400">\u53D1\u9001\u4EE3\u7406\u8BF7\u6C42\u540E\u5C06\u81EA\u52A8\u8BB0\u5F55\u7EDF\u8BA1\u4FE1\u606F</p>
            </div>
            <!-- \u56FE\u8868\u5185\u5BB9 -->
            <div id="statsChartsContent">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white rounded-xl p-4 shadow-sm">
                  <h3 class="text-sm font-medium text-gray-600 mb-2">\u6BCF\u65E5\u8BF7\u6C42\u91CF\uFF08\u8FD17\u5929\uFF09</h3>
                  <canvas id="dailyChart" height="200"></canvas>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm">
                  <h3 class="text-sm font-medium text-gray-600 mb-2">\u6BCF\u5C0F\u65F6\u8BF7\u6C42\u91CF\uFF08\u8FD124\u5C0F\u65F6\uFF09</h3>
                  <canvas id="hourlyChart" height="200"></canvas>
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div class="bg-white rounded-xl p-4 shadow-sm">
                  <h3 class="text-sm font-medium text-gray-600 mb-2">\u4ECA\u65E5 API \u4F7F\u7528\u6392\u884C</h3>
                  <canvas id="urlPieChart" height="200"></canvas>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm">
                  <h3 class="text-sm font-medium text-gray-600 mb-2">\u4ECA\u65E5 Key \u4F7F\u7528\u6392\u884C</h3>
                  <div id="keyRankList" class="space-y-2 max-h-48 overflow-y-auto"></div>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm">
                  <h3 class="text-sm font-medium text-gray-600 mb-2"><i class="fas fa-globe mr-1 text-blue-500"></i>\u4ECA\u65E5 IP \u6392\u884C</h3>
                  <div id="ipRankList" class="space-y-1 max-h-36 overflow-y-auto text-xs"></div>
                  <div class="mt-2 pt-2 border-t border-gray-100">
                    <h4 class="text-xs font-medium text-red-600 mb-1"><i class="fas fa-ban mr-1"></i>\u9ED1\u540D\u5355 <span id="blacklistCount" class="bg-red-100 px-1 rounded">0</span></h4>
                    <div id="blacklistContent" class="space-y-1 max-h-24 overflow-y-auto text-xs"></div>
                  </div>
                </div>
                <div class="bg-white rounded-xl p-4 shadow-sm">
                  <h3 class="text-sm font-medium text-gray-600 mb-2"><i class="fas fa-user-clock mr-1 text-purple-500"></i>\u767B\u5F55\u8BB0\u5F55</h3>
                  <div id="loginRecordsList" class="space-y-1 max-h-48 overflow-y-auto text-xs"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Add New Config Card -->
      <div class="glass-effect rounded-2xl shadow-xl mini-card mb-6 card-hover">
        <h2 class="text-lg font-bold text-gray-800 mb-4"><i class="fas fa-plus-circle mr-2 text-purple-600"></i>\u6DFB\u52A0\u65B0\u914D\u7F6E</h2>
        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div class="md:col-span-3">
            <label class="block text-xs font-medium text-gray-600 mb-1">API URL</label>
            <input type="text" id="newApiUrl" list="existingUrls" placeholder="https://api.example.com" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all">
            <datalist id="existingUrls"></datalist>
          </div>
          <div class="md:col-span-3">
            <label class="block text-xs font-medium text-gray-600 mb-1">Token</label>
            <input type="text" id="newToken" placeholder="sk-xxxxxxxxxxxxxxxx" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all">
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 mb-1">\u5907\u6CE8</label>
            <input type="text" id="newRemark" placeholder="\u53EF\u9009" maxlength="255" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all">
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 mb-1">\u6709\u6548\u671F</label>
            <input type="datetime-local" id="newExpiresAt" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all" title="\u7559\u7A7A\u8868\u793A\u6C38\u4E0D\u8FC7\u671F">
          </div>
          <div class="md:col-span-1">
            <label class="block text-xs font-medium text-gray-600 mb-1">\u72B6\u6001</label>
            <select id="newEnabled" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all">
              <option value="true">\u2713</option>
              <option value="false">\u2717</option>
            </select>
          </div>
          <div class="md:col-span-1 flex items-end">
            <button id="addBtn" class="w-full mini-btn btn-primary text-white rounded-lg font-medium shadow"><i class="fas fa-plus"></i></button>
          </div>
        </div>
      </div>

      <!-- Configs Table -->
      <div class="glass-effect rounded-2xl shadow-xl mini-card">
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-lg font-bold text-gray-800"><i class="fas fa-table mr-2 text-purple-600"></i>\u914D\u7F6E\u5217\u8868</h2>
          <div class="flex gap-2">
            <button onclick="copyAllTokens()" class="mini-btn bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-all font-medium" title="\u6279\u91CF\u590D\u5236"><i class="fas fa-copy"></i></button>
            <select id="sortBy" class="mini-input bg-purple-50 text-purple-700 rounded-lg font-medium focus:outline-none border-0">
              <option value="created_at">\u521B\u5EFA\u65F6\u95F4</option>
              <option value="updated_at">\u66F4\u65B0\u65F6\u95F4</option>
              <option value="api_url">API URL</option>
              <option value="enabled">\u72B6\u6001</option>
            </select>
            <button id="refreshBtn" class="mini-btn bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all font-medium"><i class="fas fa-sync-alt"></i></button>
          </div>
        </div>
        <div class="mb-3">
          <input type="text" id="searchInput" placeholder="\u641C\u7D22 API URL\u3001Token \u6216\u5907\u6CE8..." class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all" oninput="filterConfigs()">
        </div>
        <div class="overflow-x-auto">
          <table id="configsTable" class="w-full mini-table">
            <thead>
              <tr class="border-b border-purple-200">
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">API URL</th>
                <th class="text-center py-2 px-2 font-medium text-gray-600 text-xs">ID</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">SK \u522B\u540D</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">Token</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">\u5907\u6CE8</th>
                <th class="text-center py-2 px-2 font-medium text-gray-600 text-xs">\u6709\u6548\u671F</th>
                <th class="text-center py-2 px-2 font-medium text-gray-600 text-xs">\u72B6\u6001</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">\u521B\u5EFA\u65F6\u95F4</th>
                <th class="text-left py-2 px-2 font-medium text-gray-600 text-xs">\u6700\u540E\u8BF7\u6C42</th>
                <th class="text-center py-2 px-2 font-medium text-gray-600 text-xs">\u64CD\u4F5C</th>
              </tr>
            </thead>
            <tbody id="configsTableBody">
              <tr><td colspan="10" class="text-center text-gray-500 py-8"><i class="fas fa-spinner fa-spin text-2xl mb-2 text-purple-400"></i><p class="text-sm">\u52A0\u8F7D\u4E2D...</p></td></tr>
            </tbody>
          </table>
        </div>
        <div id="pagination"></div>
      </div>
    </div>
  </div>

  <!-- \u7F16\u8F91 Modal -->
  <div id="editModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="backdrop-filter: blur(5px);">
    <div class="glass-effect rounded-xl shadow-2xl p-5 max-w-md w-full mx-4 animate-fade-in">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-edit mr-2 text-purple-600"></i>\u7F16\u8F91\u914D\u7F6E</h3>
        <button onclick="closeEditModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
      </div>
      <div class="space-y-3">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">API URL</label><input type="text" id="editApiUrl" class="w-full mini-input border border-gray-200 rounded-lg bg-gray-50" readonly></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">Token</label><input type="text" id="editToken" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all font-mono" placeholder="sk-xxxxxxxxxxxxxxxx"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">SK \u522B\u540D</label><div class="flex gap-2"><input type="text" id="editSkAlias" class="flex-1 mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-orange-500 transition-all font-mono text-orange-700" placeholder="sk-ar-xxx\uFF08\u7559\u7A7A\u5219\u65E0\uFF09" maxlength="50"><button type="button" id="genSkAliasBtn" class="mini-btn bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200" title="\u751F\u6210\u65B0\u522B\u540D"><i class="fas fa-sync-alt"></i></button></div><p class="text-xs text-gray-400 mt-1">\u53EF\u624B\u52A8\u8F93\u5165\u6216\u70B9\u51FB\u6309\u94AE\u81EA\u52A8\u751F\u6210</p></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">\u5907\u6CE8</label><input type="text" id="editRemark" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all" placeholder="\u53EF\u9009\u5907\u6CE8\u8BF4\u660E" maxlength="255"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">\u6709\u6548\u671F</label><input type="datetime-local" id="editExpiresAt" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"><p class="text-xs text-gray-400 mt-1">\u7559\u7A7A\u8868\u793A\u6C38\u4E0D\u8FC7\u671F</p></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">\u72B6\u6001</label><select id="editEnabled" class="w-full mini-input border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 transition-all"><option value="true">\u542F\u7528</option><option value="false">\u7981\u7528</option></select></div>
      </div>
      <div class="flex justify-end gap-2 mt-4">
        <button onclick="closeEditModal()" class="mini-btn bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium">\u53D6\u6D88</button>
        <button id="saveEditBtn" class="mini-btn btn-primary text-white rounded-lg font-medium shadow"><i class="fas fa-save mr-1"></i>\u4FDD\u5B58</button>
      </div>
    </div>
  </div>

  <script>
    let authToken = localStorage.getItem('authToken');
    let currentConfigs = [];
    let currentEditId = null;
    let isDatabaseMode = false;
    let currentPage = 1;
    const pageSize = 10;

    $(document).ready(function() {
      if (authToken) { showAdminPanel(); } else { showLoginPanel(); }
      const proxyUrl = window.location.origin;
      $('#proxyUrlExample').text(proxyUrl);
      $('.proxy-url-placeholder').text(proxyUrl);
    });

    $('#loginBtn').click(async function() {
      const password = $('#passwordInput').val().trim();
      if (!password) { showError('\u8BF7\u8F93\u5165\u5BC6\u7801'); return; }
      const btn = $(this);
      btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-2"></i>\u767B\u5F55\u4E2D...');
      authToken = password;
      localStorage.setItem('authToken', password);
      await loadConfigs(true);
      btn.prop('disabled', false).html('<i class="fas fa-sign-in-alt mr-2"></i>\u767B\u5F55');
    });

    $('#passwordInput').keypress(function(e) { if (e.which === 13) { $('#loginBtn').click(); } });
    $('#logoutBtn').click(function() { authToken = null; localStorage.removeItem('authToken'); stopStatsAutoRefresh(); showLoginPanel(); showToast('\u5DF2\u9000\u51FA\u767B\u5F55', 'info'); });
    $('#refreshBtn').click(async function() {
      const btn = $(this);
      btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
      await loadConfigs();
      btn.prop('disabled', false).html('<i class="fas fa-sync-alt"></i>');
      showToast('\u914D\u7F6E\u5DF2\u5237\u65B0', 'info');
    });

    $('#addBtn').click(async function() {
      const apiUrl = $('#newApiUrl').val().trim();
      const token = $('#newToken').val().trim();
      const remark = $('#newRemark').val().trim();
      const expiresAtVal = $('#newExpiresAt').val();
      const expiresAt = expiresAtVal ? new Date(expiresAtVal).toISOString() : null;
      const enabled = $('#newEnabled').val() === 'true';
      if (!apiUrl || !token) { showToast('\u8BF7\u586B\u5199 API URL \u548C Token', 'error'); return; }
      const btn = $(this);
      btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
      try {
        const response = await fetch('/api/configs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken }, body: JSON.stringify({ api_url: apiUrl, token, enabled, remark, expires_at: expiresAt }) });
        const result = await response.json();
        if (result.success) { $('#newApiUrl').val(''); $('#newToken').val(''); $('#newRemark').val(''); $('#newExpiresAt').val(''); loadConfigs(); showToast('\u6DFB\u52A0\u6210\u529F', 'success'); } else { showToast('\u6DFB\u52A0\u5931\u8D25: ' + result.error, 'error'); }
      } catch (error) { showToast('\u8BF7\u6C42\u5931\u8D25: ' + error.message, 'error'); }
      finally { btn.prop('disabled', false).html('<i class="fas fa-plus"></i>'); }
    });

    let lastUsedTimes = {}; // key_id -> ISO\u65F6\u95F4\u5B57\u7B26\u4E32
    let isLoadingConfigs = false;

    async function loadConfigs(isLoginAttempt = false) {
      if (isLoadingConfigs) return;
      isLoadingConfigs = true;
      // \u663E\u793A\u8868\u683C loading \u72B6\u6001
      if (!isLoginAttempt) {
        $('#configsTableBody').html('<tr><td colspan="10" class="text-center text-gray-500 py-8"><i class="fas fa-spinner fa-spin text-2xl mb-2 text-purple-400"></i><p class="text-sm">\u52A0\u8F7D\u4E2D...</p></td></tr>');
      }
      try {
        const response = await fetch('/api/configs', { headers: { 'Authorization': 'Bearer ' + authToken } });
        if (response.status === 401) { showError('\u5BC6\u7801\u9519\u8BEF\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55'); localStorage.removeItem('authToken'); showLoginPanel(); return; }
        const result = await response.json();
        if (result.success) {
          if (isLoginAttempt) {
            $('#loginPanel').addClass('hidden');
            $('#adminPanel').removeClass('hidden');
            checkSystemStatus();
            // \u8BB0\u5F55\u767B\u5F55
            fetch('/api/login', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken } }).catch(() => {});
          }
          lastUsedTimes = result.lastUsed || {};
          renderConfigs(result.data);
        }
        else { showError('\u52A0\u8F7D\u5931\u8D25: ' + result.error); }
      } catch (error) { showError('\u8BF7\u6C42\u5931\u8D25: ' + error.message); }
      finally { isLoadingConfigs = false; }
    }

    function renderConfigs(configs) {
      const rows = [];
      Object.entries(configs).forEach(([apiUrl, config]) => {
        config.keys.forEach(key => { rows.push({ id: key.id, key_id: key.key_id, sk_alias: key.sk_alias || null, api_url: apiUrl, token: key.token, enabled: key.enabled, remark: key.remark || '', expires_at: key.expires_at || null, created_at: key.created_at, updated_at: key.updated_at }); });
      });
      currentConfigs = rows;
      const uniqueApis = new Set(rows.map(r => r.api_url)).size;
      const enabledCount = rows.filter(r => r.enabled).length;
      $('#totalApis').text(uniqueApis);
      $('#totalKeys').text(rows.length);
      $('#enabledKeys').text(enabledCount);
      updateUrlDatalist(rows);
      sortConfigs();
    }

    function updateUrlDatalist(rows) {
      const uniqueUrls = [...new Set(rows.map(r => r.api_url))].sort();
      const datalist = $('#existingUrls');
      datalist.empty();
      uniqueUrls.forEach(url => { const tokenCount = rows.filter(r => r.api_url === url).length; datalist.append('<option value="' + url + '">' + url + ' (' + tokenCount + ' \u4E2A token)</option>'); });
    }

    function sortConfigs() {
      const sortBy = $('#sortBy').val();
      let sorted = [...currentConfigs];
      sorted.sort((a, b) => a.api_url.localeCompare(b.api_url));
      sorted.sort((a, b) => {
        if (sortBy === 'created_at' || sortBy === 'updated_at') { return new Date(b[sortBy]) - new Date(a[sortBy]); }
        else if (sortBy === 'enabled') { return b.enabled - a.enabled; }
        else if (sortBy === 'api_url') { return a.api_url.localeCompare(b.api_url); }
        return 0;
      });
      renderTable(sorted);
    }

    window.filterConfigs = function() {
      const searchText = $('#searchInput').val().toLowerCase();
      if (!searchText) { sortConfigs(); return; }
      const filtered = currentConfigs.filter(row => row.api_url.toLowerCase().includes(searchText) || row.token.toLowerCase().includes(searchText) || maskToken(row.token).toLowerCase().includes(searchText) || (row.remark && row.remark.toLowerCase().includes(searchText)));
      renderTable(filtered);
    }

    window.copyAllTokens = function() {
      if (currentConfigs.length === 0) { showToast('\u6682\u65E0\u914D\u7F6E', 'error'); return; }
      const tokens = currentConfigs.filter(r => r.enabled).map(r => r.api_url + ': ' + r.token).join('\\n');
      navigator.clipboard.writeText(tokens).then(() => { showToast('\u2713 \u5DF2\u590D\u5236 ' + currentConfigs.filter(r => r.enabled).length + ' \u4E2A\u5DF2\u542F\u7528\u7684 token', 'success'); }).catch(() => { showToast('\u590D\u5236\u5931\u8D25', 'error'); });
    }

    function renderTable(rows) {
      if (rows.length === 0) {
        const emptyMsg = isDatabaseMode ? '<p class="text-xs text-gray-400 mt-1">\u70B9\u51FB\u4E0A\u65B9\u6309\u94AE\u6DFB\u52A0\u7B2C\u4E00\u4E2A\u914D\u7F6E</p>' : '<p class="text-xs text-yellow-600 mt-1"><i class="fas fa-info-circle mr-1"></i>\u76F4\u4F20\u6A21\u5F0F\uFF0C\u65E0\u9700\u914D\u7F6E</p>';
        $('#configsTableBody').html('<tr><td colspan="10" class="text-center text-gray-500 py-8"><i class="fas ' + (isDatabaseMode ? 'fa-inbox' : 'fa-bolt') + ' text-3xl mb-2 ' + (isDatabaseMode ? 'text-gray-300' : 'text-yellow-300') + '"></i><p class="text-sm font-medium">' + (isDatabaseMode ? '\u6682\u65E0\u914D\u7F6E' : '\u76F4\u4F20\u6A21\u5F0F') + '</p>' + emptyMsg + '</td></tr>');
        $('#pagination').html('');
        return;
      }
      const grouped = {};
      rows.forEach(row => { if (!grouped[row.api_url]) { grouped[row.api_url] = []; } grouped[row.api_url].push(row); });
      const apiUrls = Object.keys(grouped).sort();
      const totalPages = Math.ceil(apiUrls.length / pageSize);
      const startIdx = (currentPage - 1) * pageSize;
      const pagedUrls = apiUrls.slice(startIdx, startIdx + pageSize);
      let html = '';
      pagedUrls.forEach((apiUrl, urlIdx) => {
        const tokens = grouped[apiUrl];
        const enabledCount = tokens.filter(t => t.enabled).length;
        const urlId = 'url-' + urlIdx + '-' + startIdx;
        // \u9ED8\u8BA4\u6298\u53E0\uFF0C\u7BAD\u5934\u5411\u53F3
        html += '<tr class="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-200 cursor-pointer url-header-row" data-url-id="' + urlId + '"><td colspan="10" class="py-2 px-3"><div class="flex items-center justify-between"><div class="flex items-center gap-2"><i class="fas fa-chevron-right text-purple-600 text-xs transition-transform url-toggle" id="toggle-' + urlId + '"></i><a href="' + apiUrl + '" target="_blank" class="font-medium text-xs text-purple-700 hover:text-purple-900 hover:underline truncate max-w-xs" onclick="event.stopPropagation()" title="' + apiUrl + '">' + apiUrl + '</a><span class="px-2 py-0.5 bg-purple-200 text-purple-700 rounded-full text-xs">' + tokens.length + '</span><span class="px-2 py-0.5 ' + (enabledCount > 0 ? 'bg-green-200 text-green-700' : 'bg-gray-200 text-gray-500') + ' rounded-full text-xs">' + enabledCount + ' \u542F\u7528</span></div><div class="flex items-center gap-1 action-buttons"><button class="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded hover:bg-blue-200 transition-all copy-url-btn" title="\u590D\u5236" data-url="' + encodeURIComponent(apiUrl) + '"><i class="fas fa-copy"></i></button>' + (isDatabaseMode ? '<button class="px-2 py-1 bg-green-100 text-green-600 text-xs rounded hover:bg-green-200 transition-all add-token-btn" title="\u6DFB\u52A0" data-url="' + encodeURIComponent(apiUrl) + '"><i class="fas fa-plus"></i></button>' : '') + '</div></div></td></tr>';
        tokens.forEach((row, tokenIdx) => {
          const safeRemark = escapeHtml(row.remark);
          const keyId = row.key_id || row.id;
          const skAlias = row.sk_alias;
          const skAliasHtml = skAlias
            ? '<code class="text-xs font-mono bg-orange-100 px-1 py-0.5 rounded text-orange-700 cursor-pointer hover:bg-orange-200 sk-copy-btn" title="\u70B9\u51FB\u590D\u5236">' + skAlias.substring(0, 16) + '...</code><button class="ml-1 text-orange-500 hover:text-orange-700 gen-sk-btn" data-id="' + row.id + '" title="\u91CD\u65B0\u751F\u6210"><i class="fas fa-sync-alt text-xs"></i></button>'
            : '<button class="text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded hover:bg-orange-100 gen-sk-btn" data-id="' + row.id + '"><i class="fas fa-plus mr-1"></i>\u751F\u6210</button>';
          // \u6709\u6548\u671F\u663E\u793A
          const expiresHtml = formatExpiry(row.expires_at);
          // \u6700\u540E\u8BF7\u6C42\u65F6\u95F4
          const lastUsedTime = lastUsedTimes[keyId] ? formatDate(lastUsedTimes[keyId]) : '-';
          // \u9ED8\u8BA4\u9690\u85CF token-row
          html += '<tr class="border-b border-gray-50 hover:bg-purple-50 transition-all token-row token-row-' + urlId + ' hidden"><td class="py-1.5 px-2 pl-6"><span class="text-gray-400 text-xs">#' + (tokenIdx + 1) + '</span></td><td class="py-1.5 px-2 text-center"><div class="flex items-center justify-center gap-1"><code class="text-xs font-mono bg-purple-100 px-1.5 py-0.5 rounded text-purple-700 cursor-pointer hover:bg-purple-200 id-copy-btn" title="\u70B9\u51FB\u590D\u5236">' + keyId + '</code><button class="p-0.5 text-xs bg-green-100 text-green-600 rounded hover:bg-green-200 full-key-copy-btn" data-url="' + encodeURIComponent(apiUrl) + '" data-keyid="' + keyId + '" title="\u590D\u5236\u5B8C\u6574Key"><i class="fas fa-link text-xs"></i></button></div></td><td class="py-1.5 px-2">' + skAliasHtml + '</td><td class="py-1.5 px-2"><code class="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 cursor-pointer hover:bg-gray-200 token-copy-btn" data-token="' + window.btoa(row.token) + '" title="\u70B9\u51FB\u590D\u5236">' + maskToken(row.token) + '</code></td><td class="py-1.5 px-2 remark-cell text-xs text-gray-500" title="' + safeRemark + '">' + (safeRemark || '-') + '</td><td class="py-1.5 px-2 text-center text-xs">' + expiresHtml + '</td><td class="py-1.5 px-2 text-center"><input type="checkbox" ' + (row.enabled ? 'checked' : '') + ' class="w-3 h-3 text-green-600 rounded status-checkbox" data-id="' + row.id + '"></td><td class="py-1.5 px-2 text-xs text-gray-400">' + formatDate(row.created_at) + '</td><td class="py-1.5 px-2 text-xs text-gray-400">' + lastUsedTime + '</td><td class="py-1.5 px-2 text-center"><button class="p-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 edit-key-btn" data-id="' + row.id + '"><i class="fas fa-edit text-xs"></i></button> <button class="p-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 delete-key-action-btn" data-id="' + row.id + '"><i class="fas fa-trash-alt text-xs"></i></button></td></tr>';
        });
      });
      $('#configsTableBody').html(html);
      renderPagination(totalPages, apiUrls.length);
    }

    function renderPagination(totalPages, totalItems) {
      if (totalPages <= 1) { $('#pagination').html(''); return; }
      let pHtml = '<div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100"><div class="text-xs text-gray-400">' + totalItems + ' \u4E2A API \xB7 ' + currentPage + '/' + totalPages + '</div><div class="flex gap-1">';
      if (currentPage > 1) pHtml += '<button class="px-2 py-0.5 bg-purple-100 text-purple-600 rounded text-xs hover:bg-purple-200 page-btn" data-page="' + (currentPage - 1) + '"><i class="fas fa-chevron-left"></i></button>';
      for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) { pHtml += '<button class="px-2 py-0.5 ' + (i === currentPage ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-600 hover:bg-purple-200') + ' rounded text-xs page-btn" data-page="' + i + '">' + i + '</button>'; }
      if (currentPage < totalPages) pHtml += '<button class="px-2 py-0.5 bg-purple-100 text-purple-600 rounded text-xs hover:bg-purple-200 page-btn" data-page="' + (currentPage + 1) + '"><i class="fas fa-chevron-right"></i></button>';
      pHtml += '</div></div>';
      $('#pagination').html(pHtml);
    }

    $(document).on('click', '.token-copy-btn', function() { const encodedToken = $(this).data('token'); if (encodedToken) { copyToken(window.atob(encodedToken)); } });
    $(document).on('click', '.id-copy-btn', function() { const id = $(this).text(); navigator.clipboard.writeText(id).then(() => { showToast('ID ' + id + ' \u5DF2\u590D\u5236', 'success'); }); });
    $(document).on('click', '.full-key-copy-btn', function() { const url = decodeURIComponent($(this).data('url')); const keyId = $(this).data('keyid'); const fullKey = url + ':' + keyId; navigator.clipboard.writeText(fullKey).then(() => { showToast('\u2713 \u5B8C\u6574 Key \u5DF2\u590D\u5236', 'success'); }).catch(() => { const textarea = document.createElement('textarea'); textarea.value = fullKey; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea); showToast('\u2713 \u5B8C\u6574 Key \u5DF2\u590D\u5236', 'success'); }); });
    // SK \u522B\u540D\u590D\u5236
    $(document).on('click', '.sk-copy-btn', function() { const row = currentConfigs.find(r => r.id == $(this).closest('tr').find('.status-checkbox').data('id')); if (row && row.sk_alias) { navigator.clipboard.writeText(row.sk_alias).then(() => { showToast('\u2713 SK \u522B\u540D\u5DF2\u590D\u5236', 'success'); }); } });
    // \u751F\u6210/\u91CD\u65B0\u751F\u6210 SK \u522B\u540D
    $(document).on('click', '.gen-sk-btn', async function(e) { e.stopPropagation(); const id = $(this).data('id'); const btn = $(this); btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>'); try { const response = await fetch('/api/configs/' + id + '/sk-alias', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken } }); const result = await response.json(); if (result.success) { showToast('\u2713 SK \u522B\u540D\u5DF2\u751F\u6210', 'success'); loadConfigs(); } else { showToast('\u751F\u6210\u5931\u8D25: ' + result.error, 'error'); btn.prop('disabled', false).html('<i class="fas fa-plus mr-1"></i>\u751F\u6210'); } } catch (error) { showToast('\u8BF7\u6C42\u5931\u8D25: ' + error.message, 'error'); btn.prop('disabled', false).html('<i class="fas fa-plus mr-1"></i>\u751F\u6210'); } });
    $(document).on('change', '.status-checkbox', function() { toggleKey($(this).data('id'), $(this).is(':checked')); });
    $(document).on('click', '.edit-key-btn', function() { openEditModal($(this).data('id')); });
    $(document).on('click', '.delete-key-action-btn', function() { deleteKey($(this).data('id')); });
    $(document).on('click', '.copy-url-btn', function() { const proxyUrl = window.location.origin; navigator.clipboard.writeText(proxyUrl).then(() => { showToast('\u2713 \u4EE3\u7406\u5730\u5740\u5DF2\u590D\u5236: ' + proxyUrl, 'success'); }).catch(() => { const textarea = document.createElement('textarea'); textarea.value = proxyUrl; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea); showToast('\u2713 \u4EE3\u7406\u5730\u5740\u5DF2\u590D\u5236', 'success'); }); });
    $(document).on('click', '.add-token-btn', function() { const url = decodeURIComponent($(this).data('url')); $('#newApiUrl').val(url); $('html, body').animate({ scrollTop: $('#newApiUrl').offset().top - 100 }, 300, function() { $('#newToken').focus(); $('#newToken').addClass('ring-2 ring-purple-500'); setTimeout(() => $('#newToken').removeClass('ring-2 ring-purple-500'), 2000); }); showToast('\u5DF2\u586B\u5145 URL\uFF0C\u8BF7\u8F93\u5165 Token', 'info'); });
    $(document).on('click', '.url-header-row', function(e) { if ($(e.target).closest('.action-buttons').length > 0) { return; } const urlId = $(this).data('url-id'); const toggle = $('#toggle-' + urlId); const rows = $('.token-row-' + urlId); if (toggle.hasClass('fa-chevron-down')) { toggle.removeClass('fa-chevron-down').addClass('fa-chevron-right'); rows.hide(); } else { toggle.removeClass('fa-chevron-right').addClass('fa-chevron-down'); rows.show(); } });
    $(document).on('click', '.page-btn', function() { currentPage = parseInt($(this).data('page')); sortConfigs(); });
    $('#sortBy').change(function() { sortConfigs(); });

    window.openEditModal = function(id) { const config = currentConfigs.find(c => c.id === id); if (!config) return; currentEditId = id; $('#editApiUrl').val(config.api_url); $('#editToken').val(config.token); $('#editSkAlias').val(config.sk_alias || ''); $('#editRemark').val(config.remark || ''); $('#editExpiresAt').val(config.expires_at ? toLocalDateTimeString(config.expires_at) : ''); $('#editEnabled').val(config.enabled.toString()); $('#editModal').removeClass('hidden'); };
    window.closeEditModal = function() { $('#editModal').addClass('hidden'); currentEditId = null; };

    $('#saveEditBtn').click(async function() {
      if (!currentEditId) return;
      const token = $('#editToken').val().trim();
      const skAlias = $('#editSkAlias').val().trim();
      const remark = $('#editRemark').val().trim();
      const expiresAtVal = $('#editExpiresAt').val();
      const expiresAt = expiresAtVal ? new Date(expiresAtVal).toISOString() : null;
      const enabled = $('#editEnabled').val() === 'true';
      if (!token) { showToast('Token \u4E0D\u80FD\u4E3A\u7A7A', 'error'); return; }
      if (skAlias && !skAlias.startsWith('sk-ar-')) { showToast('SK \u522B\u540D\u5FC5\u987B\u4EE5 sk-ar- \u5F00\u5934', 'error'); return; }
      const btn = $(this);
      btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
      try {
        const response = await fetch('/api/configs/' + currentEditId, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken }, body: JSON.stringify({ token, enabled, remark, expires_at: expiresAt, sk_alias: skAlias || null }) });
        const result = await response.json();
        if (result.success) { showToast('\u66F4\u65B0\u6210\u529F', 'success'); closeEditModal(); loadConfigs(); } else { showToast('\u66F4\u65B0\u5931\u8D25: ' + result.error, 'error'); }
      } catch (error) { showToast('\u8BF7\u6C42\u5931\u8D25: ' + error.message, 'error'); }
      finally { btn.prop('disabled', false).html('<i class="fas fa-save mr-1"></i>\u4FDD\u5B58'); }
    });

    $('#editModal').click(function(e) { if (e.target === this) { closeEditModal(); } });

    // \u6A21\u6001\u6846\u5185\u751F\u6210 SK \u522B\u540D\u6309\u94AE
    $('#genSkAliasBtn').click(function() {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = 'sk-ar-';
      for (let i = 0; i < 32; i++) { result += chars.charAt(Math.floor(Math.random() * chars.length)); }
      $('#editSkAlias').val(result);
      showToast('\u5DF2\u751F\u6210\u65B0 SK \u522B\u540D\uFF08\u4FDD\u5B58\u540E\u751F\u6548\uFF09', 'info');
    });

    window.toggleKey = async function(id, enabled) {
      try {
        const response = await fetch('/api/configs/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken }, body: JSON.stringify({ enabled }) });
        const result = await response.json();
        if (result.success) { showToast(enabled ? '\u5DF2\u542F\u7528\u5BC6\u94A5' : '\u5DF2\u7981\u7528\u5BC6\u94A5', 'success'); loadConfigs(); } else { showToast('\u66F4\u65B0\u5931\u8D25: ' + result.error, 'error'); loadConfigs(); }
      } catch (error) { showToast('\u8BF7\u6C42\u5931\u8D25: ' + error.message, 'error'); }
    };

    window.deleteKey = async function(id) {
      if (!confirm('\u26A0\uFE0F \u786E\u5B9A\u8981\u5220\u9664\u6B64\u914D\u7F6E\u5417\uFF1F')) { return; }
      try {
        const response = await fetch('/api/configs/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + authToken } });
        const result = await response.json();
        if (result.success) { loadConfigs(); showToast('\u914D\u7F6E\u5DF2\u5220\u9664', 'success'); } else { showToast('\u5220\u9664\u5931\u8D25: ' + result.error, 'error'); }
      } catch (error) { showToast('\u8BF7\u6C42\u5931\u8D25: ' + error.message, 'error'); }
    };

    function maskToken(token) { if (!token) return ''; if (token.length <= 10) return token; return token.substring(0, 8) + '...' + token.substring(token.length - 4); }
    window.copyToken = function(token) { if (!token) { showToast('\u65E0\u6548\u7684 token', 'error'); return; } navigator.clipboard.writeText(token).then(() => { showToast('\u2713 Token \u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F', 'success'); }).catch(() => { const textarea = document.createElement('textarea'); textarea.value = token; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea); showToast('\u2713 Token \u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F', 'success'); }); }
    function formatDate(dateString) { if (!dateString) return '-'; const date = new Date(dateString); if (isNaN(date.getTime())) return '-'; const pad = (n) => n.toString().padStart(2, '0'); return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()); }
    function formatExpiry(expiresAt) { if (!expiresAt) return '<span class="text-green-600"><i class="fas fa-infinity"></i></span>'; const expDate = new Date(expiresAt); const now = new Date(); if (expDate < now) return '<span class="text-red-500" title="\u5DF2\u8FC7\u671F"><i class="fas fa-times-circle"></i> \u5DF2\u8FC7\u671F</span>'; const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24)); if (diffDays <= 7) return '<span class="text-yellow-600" title="' + formatDate(expiresAt) + '"><i class="fas fa-exclamation-triangle"></i> ' + diffDays + '\u5929</span>'; return '<span class="text-gray-500" title="' + formatDate(expiresAt) + '">' + diffDays + '\u5929</span>'; }
    function toLocalDateTimeString(isoString) { if (!isoString) return ''; const date = new Date(isoString); const pad = (n) => n.toString().padStart(2, '0'); return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()); }
    function escapeHtml(str) { if (!str) return ''; return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
    function showLoginPanel() { $('#loginPanel').removeClass('hidden'); $('#adminPanel').addClass('hidden'); }
    function showAdminPanel() { $('#loginPanel').addClass('hidden'); $('#adminPanel').removeClass('hidden'); checkSystemStatus(); testRedis(); loadConfigs(); loadStats(); loadBlacklist(); startStatsAutoRefresh(); }

    // \u6298\u53E0/\u5C55\u5F00\u7EDF\u8BA1\u56FE\u8868
    window.toggleStats = function() {
      const content = $('#statsContent');
      const toggle = $('#statsToggle');
      if (content.hasClass('hidden')) {
        content.removeClass('hidden');
        toggle.css('transform', 'rotate(180deg)');
      } else {
        content.addClass('hidden');
        toggle.css('transform', 'rotate(0deg)');
      }
    };

    // ============ \u7EDF\u8BA1\u56FE\u8868 ============
    let dailyChart = null;
    let hourlyChart = null;
    let urlPieChart = null;
    let statsAutoRefreshTimer = null;
    let isLoadingStats = false;

    async function loadStats(showToastMsg = false) {
      if (isLoadingStats) return;
      isLoadingStats = true;

      const empty = $('#statsEmpty');
      const emptyText = $('#statsEmptyText');
      const content = $('#statsChartsContent');
      const summary = $('#statsSummary');
      const refreshBtn = $('#refreshStatsBtn');

      // \u663E\u793A loading \u72B6\u6001
      refreshBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
      summary.html('<i class="fas fa-spinner fa-spin text-purple-500"></i> \u52A0\u8F7D\u4E2D...');

      try {
        const response = await fetch('/api/stats?days=7', { headers: { 'Authorization': 'Bearer ' + authToken } });
        const result = await response.json();

        if (result.success && result.data.enabled) {
          // Redis \u5DF2\u914D\u7F6E
          if (result.data.summary.total === 0) {
            // \u6CA1\u6709\u6570\u636E - \u663E\u793A\u7A7A\u72B6\u6001
            empty.removeClass('hidden');
            emptyText.text('\u53D1\u9001\u4EE3\u7406\u8BF7\u6C42\u540E\u5C06\u81EA\u52A8\u8BB0\u5F55\u7EDF\u8BA1\u4FE1\u606F');
            content.addClass('hidden');
            summary.text('\u6682\u65E0\u6570\u636E');
          } else {
            // \u6709\u6570\u636E - \u663E\u793A\u56FE\u8868
            empty.addClass('hidden');
            content.removeClass('hidden');
            summary.text('\u603B\u8BA1 ' + result.data.summary.total + ' \u8BF7\u6C42');
            renderCharts(result.data);
          }
          if (showToastMsg) showToast('\u7EDF\u8BA1\u5DF2\u5237\u65B0', 'info');
          // \u52A0\u8F7D\u767B\u5F55\u8BB0\u5F55
          loadLoginRecords();
        } else {
          // Redis \u672A\u914D\u7F6E - \u663E\u793A\u7A7A\u72B6\u6001 + \u63D0\u793A
          empty.removeClass('hidden');
          emptyText.html('<span class="text-red-400">Redis \u672A\u914D\u7F6E\uFF0C\u8BF7\u5728 Cloudflare \u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF</span>');
          content.addClass('hidden');
          summary.html('<span class="text-red-400">\u672A\u542F\u7528</span>');
        }
      } catch (e) {
        empty.removeClass('hidden');
        emptyText.html('<span class="text-red-400">\u52A0\u8F7D\u5931\u8D25: ' + e.message + '</span>');
        content.addClass('hidden');
        summary.html('<span class="text-red-400">\u9519\u8BEF</span>');
      } finally {
        isLoadingStats = false;
        refreshBtn.prop('disabled', false).html('<i class="fas fa-sync-alt"></i>');
      }
    }

    // \u542F\u52A8\u7EDF\u8BA1\u81EA\u52A8\u5237\u65B0\uFF0830\u79D2\uFF09
    function startStatsAutoRefresh() {
      stopStatsAutoRefresh();
      statsAutoRefreshTimer = setInterval(() => {
        loadStats(false); // \u81EA\u52A8\u5237\u65B0\u4E0D\u663E\u793A toast
      }, 30000);
    }

    function stopStatsAutoRefresh() {
      if (statsAutoRefreshTimer) {
        clearInterval(statsAutoRefreshTimer);
        statsAutoRefreshTimer = null;
      }
    }

    // \u52A0\u8F7D\u767B\u5F55\u8BB0\u5F55
    async function loadLoginRecords() {
      try {
        const response = await fetch('/api/logins?limit=10', { headers: { 'Authorization': 'Bearer ' + authToken } });
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          const html = result.data.map(r => {
            const time = new Date(r.time);
            const timeStr = time.toLocaleDateString('zh-CN') + ' ' + time.toLocaleTimeString('zh-CN');
            return '<div class="flex justify-between items-center py-1 px-2 bg-gray-50 rounded"><span class="text-gray-600">' + timeStr + '</span><span class="text-purple-600 font-mono">' + r.ip + '</span></div>';
          }).join('');
          $('#loginRecordsList').html(html);
        } else {
          $('#loginRecordsList').html('<div class="text-gray-400 text-center py-4">\u6682\u65E0\u767B\u5F55\u8BB0\u5F55</div>');
        }
      } catch {
        $('#loginRecordsList').html('<div class="text-red-400 text-center py-4">\u52A0\u8F7D\u5931\u8D25</div>');
      }
    }

    function renderEmptyCharts() {
      const emptyData = {
        daily: Array(7).fill(0).map((_, i) => {
          const d = new Date(); d.setDate(d.getDate() - 6 + i);
          return { date: d.toISOString().split('T')[0], total: 0, success: 0, error: 0 };
        }),
        hourly: Array(24).fill(0).map((_, i) => {
          const d = new Date(); d.setHours(d.getHours() - 23 + i);
          return { hour: d.getHours() + ':00', total: 0 };
        }),
        topUrls: {},
        topKeys: {},
        summary: { total: 0, success: 0, error: 0 }
      };
      renderCharts(emptyData);
    }

    function renderCharts(data) {
      // \u66F4\u65B0\u6458\u8981
      $('#statsSummary').text('\u603B\u8BA1: ' + data.summary.total + ' \u8BF7\u6C42 | \u6210\u529F: ' + data.summary.success + ' | \u5931\u8D25: ' + data.summary.error);

      // \u6BCF\u65E5\u56FE\u8868
      const dailyCtx = document.getElementById('dailyChart').getContext('2d');
      if (dailyChart) dailyChart.destroy();
      dailyChart = new Chart(dailyCtx, {
        type: 'bar',
        data: {
          labels: data.daily.map(d => d.date.substring(5)),
          datasets: [{
            label: '\u6210\u529F',
            data: data.daily.map(d => d.success),
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderRadius: 4,
          }, {
            label: '\u5931\u8D25',
            data: data.daily.map(d => d.error),
            backgroundColor: 'rgba(239, 68, 68, 0.8)',
            borderRadius: 4,
          }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
      });

      // \u5C0F\u65F6\u56FE\u8868
      const hourlyCtx = document.getElementById('hourlyChart').getContext('2d');
      if (hourlyChart) hourlyChart.destroy();
      hourlyChart = new Chart(hourlyCtx, {
        type: 'line',
        data: {
          labels: data.hourly.map(h => h.hour.split('-').slice(2).join(':')),
          datasets: [{ label: '\u8BF7\u6C42\u91CF', data: data.hourly.map(h => h.total), borderColor: '#667eea', backgroundColor: 'rgba(102, 126, 234, 0.1)', fill: true, tension: 0.3 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });

      // URL \u997C\u56FE
      const urlCtx = document.getElementById('urlPieChart').getContext('2d');
      if (urlPieChart) urlPieChart.destroy();
      const urlEntries = Object.entries(data.topUrls).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (urlEntries.length > 0) {
        urlPieChart = new Chart(urlCtx, {
          type: 'doughnut',
          data: {
            labels: urlEntries.map(e => e[0].replace(/https?:\\/\\//, '').substring(0, 20)),
            datasets: [{ data: urlEntries.map(e => e[1]), backgroundColor: ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#ef4444'] }]
          },
          options: { responsive: true, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
        });
      }

      // Key \u6392\u884C\u5217\u8868
      const keyEntries = Object.entries(data.topKeys).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (keyEntries.length > 0) {
        $('#keyRankList').html(keyEntries.map((e, i) => '<div class="flex justify-between items-center py-1 px-2 bg-gray-50 rounded text-xs"><span class="font-mono text-purple-600">' + (i+1) + '. ' + e[0] + '</span><span class="text-gray-500">' + e[1] + ' \u6B21</span></div>').join(''));
      } else {
        $('#keyRankList').html('<div class="text-xs text-gray-400 text-center py-4">\u6682\u65E0\u6570\u636E</div>');
      }

      // IP \u6392\u884C\u5217\u8868\uFF08\u5E26\u5C01\u7981\u6309\u94AE\uFF09
      const ipEntries = Object.entries(data.topIps || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (ipEntries.length > 0) {
        $('#ipRankList').html(ipEntries.map((e, i) => '<div class="flex justify-between items-center py-1 px-2 bg-gray-50 rounded"><span class="font-mono text-blue-600">' + (i+1) + '. ' + e[0] + '</span><div class="flex items-center gap-1"><span class="text-gray-500">' + e[1] + '</span><button class="text-red-400 hover:text-red-600 block-ip-btn" data-ip="' + e[0] + '" title="\u5C01\u7981"><i class="fas fa-ban"></i></button></div></div>').join(''));
      } else {
        $('#ipRankList').html('<div class="text-xs text-gray-400 text-center py-4">\u6682\u65E0\u6570\u636E</div>');
      }
    }

    async function checkSystemStatus() {
      try {
        const response = await fetch('/api/status', { headers: { 'Authorization': 'Bearer ' + authToken } });
        const result = await response.json();
        if (result.success) { isDatabaseMode = result.database_configured && result.database_connected; updateStorageModeUI(result); }
        else { updateStorageModeUI({ storage_mode: 'passthrough', database_configured: false, database_connected: false }); }
      } catch (error) { updateStorageModeUI({ storage_mode: 'passthrough', database_configured: false, database_connected: false, database_error: error.message }); }
    }

    async function testRedis() {
      try {
        const response = await fetch('/api/redis/test', { headers: { 'Authorization': 'Bearer ' + authToken } });
        const result = await response.json();
        updateRedisUI(result);
      } catch (error) { updateRedisUI({ success: false, configured: false, error: error.message }); }
    }

    function updateRedisUI(status) {
      const statusText = $('#redisStatus');
      const icon = $('#redisIcon');
      const hint = $('#redisStatusText');
      if (status.success && status.connected) {
        statusText.text('\u5DF2\u8FDE\u63A5').removeClass('text-gray-800 text-yellow-600').addClass('text-green-600');
        icon.removeClass('bg-gray-100 bg-yellow-100').addClass('bg-green-100').html('<i class="fas fa-bolt text-green-600 text-xl"></i>');
        hint.html('<i class="fas fa-check-circle text-green-500 mr-1"></i>Redis \u6B63\u5E38');
      } else if (status.configured && !status.connected) {
        statusText.text('\u8FDE\u63A5\u5931\u8D25').removeClass('text-gray-800 text-green-600').addClass('text-yellow-600');
        icon.removeClass('bg-gray-100 bg-green-100').addClass('bg-yellow-100').html('<i class="fas fa-exclamation-triangle text-yellow-600 text-xl"></i>');
        hint.html('<i class="fas fa-times-circle text-red-500 mr-1"></i>' + (status.error || '\u8FDE\u63A5\u5931\u8D25'));
      } else {
        statusText.text('\u672A\u914D\u7F6E').removeClass('text-green-600 text-yellow-600').addClass('text-gray-800');
        icon.removeClass('bg-green-100 bg-yellow-100').addClass('bg-gray-100').html('<i class="fas fa-bolt text-gray-400 text-xl"></i>');
        hint.html('<i class="fas fa-info-circle text-blue-500 mr-1"></i>\u672A\u914D\u7F6E Redis');
      }
    }

    function updateStorageModeUI(status) {
      const modeText = $('#storageMode');
      const modeIcon = $('#storageModeIcon');
      const dbStatusText = $('#dbStatusText');
      if (status.database_configured && status.database_connected) {
        modeText.text('\u6570\u636E\u5E93\u6A21\u5F0F').removeClass('text-gray-800 text-yellow-600').addClass('text-green-600');
        modeIcon.removeClass('bg-gray-100 bg-yellow-100').addClass('bg-green-100').html('<i class="fas fa-database text-green-600 text-2xl"></i>');
        dbStatusText.html('<i class="fas fa-check-circle text-green-500 mr-1"></i>Supabase \u5DF2\u8FDE\u63A5');
        setDatabaseModeEnabled(true);
      } else if (status.database_configured && !status.database_connected) {
        modeText.text('\u6570\u636E\u5E93\u6A21\u5F0F').removeClass('text-gray-800 text-green-600').addClass('text-yellow-600');
        modeIcon.removeClass('bg-gray-100 bg-green-100').addClass('bg-yellow-100').html('<i class="fas fa-exclamation-triangle text-yellow-600 text-2xl"></i>');
        dbStatusText.html('<i class="fas fa-times-circle text-red-500 mr-1"></i>\u8FDE\u63A5\u5931\u8D25: ' + (status.database_error || '\u672A\u77E5\u9519\u8BEF'));
        setDatabaseModeEnabled(false);
      } else {
        modeText.text('\u76F4\u4F20\u6A21\u5F0F').removeClass('text-green-600 text-yellow-600').addClass('text-gray-800');
        modeIcon.removeClass('bg-green-100 bg-yellow-100').addClass('bg-gray-100').html('<i class="fas fa-bolt text-gray-600 text-2xl"></i>');
        dbStatusText.html('<i class="fas fa-info-circle text-blue-500 mr-1"></i>\u672A\u914D\u7F6E\u6570\u636E\u5E93\uFF0C\u4EC5\u652F\u6301\u76F4\u4F20 Token');
        setDatabaseModeEnabled(false);
      }
    }

    function setDatabaseModeEnabled(enabled) {
      isDatabaseMode = enabled;
      const addBtn = $('#addBtn');
      const addInputs = $('#newApiUrl, #newToken, #newEnabled');
      if (enabled) { addBtn.prop('disabled', false).removeClass('opacity-50 cursor-not-allowed'); addInputs.prop('disabled', false).removeClass('bg-gray-100'); $('#addConfigNotice').remove(); }
      else { addBtn.prop('disabled', true).addClass('opacity-50 cursor-not-allowed'); addInputs.prop('disabled', true).addClass('bg-gray-100'); if ($('#addConfigNotice').length === 0) { $('#addBtn').after('<p id="addConfigNotice" class="text-xs text-yellow-600 mt-2"><i class="fas fa-info-circle mr-1"></i>\u9700\u8981\u914D\u7F6E\u6570\u636E\u5E93\u624D\u80FD\u6DFB\u52A0 Token</p>'); } }
    }

    function showError(msg) { $('#loginError').text(msg).removeClass('hidden'); setTimeout(() => $('#loginError').addClass('hidden'), 3000); }
    function showToast(message, type = 'success') { const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' }; const toast = $('<div class="toast toast-' + type + '"><i class="fas ' + icons[type] + ' mr-2"></i>' + message + '</div>'); $('body').append(toast); setTimeout(() => { toast.fadeOut(300, function() { $(this).remove(); }); }, 3000); }

    // ============ IP \u9ED1\u540D\u5355\u7BA1\u7406 ============
    $(document).on('click', '.block-ip-btn', async function() {
      const ip = $(this).data('ip');
      if (!ip) return;
      const reason = prompt('\u8BF7\u8F93\u5165\u5C01\u7981\u539F\u56E0\uFF08\u53EF\u9009\uFF09:', '\u624B\u52A8\u5C01\u7981');
      if (reason === null) return; // \u7528\u6237\u53D6\u6D88
      try {
        const response = await fetch('/api/blacklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
          body: JSON.stringify({ ip, reason: reason || '\u624B\u52A8\u5C01\u7981' })
        });
        const result = await response.json();
        if (result.success) {
          showToast('IP ' + ip + ' \u5DF2\u5C01\u7981', 'success');
          loadStats(false);
        } else {
          showToast('\u5C01\u7981\u5931\u8D25: ' + result.error, 'error');
        }
      } catch (error) {
        showToast('\u8BF7\u6C42\u5931\u8D25: ' + error.message, 'error');
      }
    });

    // \u89E3\u5C01 IP
    window.unblockIp = async function(ip) {
      if (!confirm('\u786E\u5B9A\u8981\u89E3\u5C01 IP ' + ip + ' \u5417\uFF1F')) return;
      try {
        const response = await fetch('/api/blacklist/' + encodeURIComponent(ip), {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        const result = await response.json();
        if (result.success) {
          showToast('IP ' + ip + ' \u5DF2\u89E3\u5C01', 'success');
          loadBlacklist();
        } else {
          showToast('\u89E3\u5C01\u5931\u8D25: ' + result.error, 'error');
        }
      } catch (error) {
        showToast('\u8BF7\u6C42\u5931\u8D25: ' + error.message, 'error');
      }
    };

    // \u52A0\u8F7D\u9ED1\u540D\u5355
    async function loadBlacklist() {
      try {
        const response = await fetch('/api/blacklist', { headers: { 'Authorization': 'Bearer ' + authToken } });
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          const html = result.data.map(r => {
            const time = r.blocked_at ? new Date(r.blocked_at).toLocaleString('zh-CN') : '-';
            return '<div class="flex justify-between items-center py-1 px-2 bg-red-50 rounded border border-red-200"><div><span class="font-mono text-red-600">' + r.ip + '</span><span class="text-xs text-gray-500 ml-2">' + (r.reason || '') + '</span></div><div class="flex items-center gap-2"><span class="text-xs text-gray-400">' + time + '</span><button onclick="unblockIp(\\'' + r.ip + '\\')" class="text-green-500 hover:text-green-700" title="\u89E3\u5C01"><i class="fas fa-unlock"></i></button></div></div>';
          }).join('');
          $('#blacklistContent').html(html);
          $('#blacklistCount').text(result.data.length);
        } else {
          $('#blacklistContent').html('<div class="text-xs text-gray-400 text-center py-4">\u6682\u65E0\u5C01\u7981 IP</div>');
          $('#blacklistCount').text('0');
        }
      } catch {
        $('#blacklistContent').html('<div class="text-xs text-red-400 text-center py-4">\u52A0\u8F7D\u5931\u8D25</div>');
      }
    }
  <\/script>
</body>
</html>`;
}

// src/pages/docs.js
function getDocsHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AnyRouter - \u901A\u7528 API \u4EE3\u7406\u670D\u52A1\u6587\u6863</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .glass-effect { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); }
    .code-block { background: #1e1e1e; border-radius: 8px; overflow-x: auto; }
    .code-block pre { margin: 0; padding: 16px; }
    .copy-btn { position: absolute; top: 8px; right: 8px; opacity: 0; transition: opacity 0.2s; }
    .code-block:hover .copy-btn { opacity: 1; }
    .toc-link { transition: all 0.2s; }
    .toc-link:hover { color: #667eea; transform: translateX(4px); }
    .toc-link.active { color: #667eea; font-weight: 600; border-left: 3px solid #667eea; padding-left: 12px; margin-left: -15px; }
    .section { scroll-margin-top: 80px; }
    html { scroll-behavior: smooth; }
    .api-card { transition: all 0.2s; }
    .api-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.1); }
    /* TOC \u5DE6\u53F3\u6536\u8D77\u52A8\u753B */
    .toc-sidebar { transition: width 0.3s ease, opacity 0.3s ease, padding 0.3s ease; overflow: hidden; }
    .toc-sidebar.collapsed { width: 48px !important; }
    .toc-sidebar.collapsed .toc-content { opacity: 0; pointer-events: none; }
    .toc-sidebar .toc-content { transition: opacity 0.2s ease; }
    .toc-toggle-btn { transition: transform 0.3s ease; }
    .toc-sidebar.collapsed .toc-toggle-btn { transform: rotate(180deg); }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">
  <!-- Header -->
  <header class="gradient-bg text-white py-16 px-4">
    <div class="container mx-auto max-w-5xl">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-4xl font-bold mb-4"><i class="fas fa-rocket mr-3"></i>AnyRouter</h1>
          <p class="text-xl text-purple-100 mb-2">\u901A\u7528 API \u4EE3\u7406\u670D\u52A1</p>
          <p class="text-purple-200 mb-6">\u652F\u6301 OpenAI\u3001Anthropic\u3001Google\u3001Azure\u3001Groq \u7B49\u4EFB\u610F HTTP API \u7684\u7EDF\u4E00\u8F6C\u53D1</p>
          <div class="flex gap-3 flex-wrap">
            <a href="https://github.com/dext7r/anyrouter" target="_blank" class="inline-flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all">
              <i class="fab fa-github mr-2"></i>GitHub
            </a>
            <a href="/admin" class="inline-flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all">
              <i class="fas fa-cog mr-2"></i>\u7BA1\u7406\u9762\u677F
            </a>
            <a href="/" class="inline-flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all">
              <i class="fas fa-home mr-2"></i>\u9996\u9875
            </a>
          </div>
        </div>
        <div class="hidden md:block text-right">
          <div class="text-6xl opacity-20"><i class="fas fa-cloud"></i></div>
        </div>
      </div>
    </div>
  </header>

  <div class="container mx-auto max-w-5xl px-4 py-8">
    <div class="flex gap-8">
      <!-- Sidebar TOC -->
      <aside id="tocSidebar" class="hidden lg:block w-56 shrink-0 toc-sidebar">
        <nav class="sticky top-8 glass-effect rounded-xl shadow-lg overflow-hidden">
          <div class="p-3 cursor-pointer hover:bg-purple-50 transition-all flex items-center justify-between" onclick="toggleTOC()">
            <h3 class="font-bold text-gray-800 toc-content whitespace-nowrap"><i class="fas fa-list mr-2 text-purple-600"></i>\u76EE\u5F55</h3>
            <i class="fas fa-chevron-left text-purple-600 toc-toggle-btn"></i>
          </div>
          <ul class="space-y-2 text-sm text-gray-600 px-4 pb-4 toc-content">
            <li><a href="#overview" class="toc-link block py-1">\u6982\u8FF0</a></li>
            <li><a href="#supported-apis" class="toc-link block py-1">\u652F\u6301\u7684 API</a></li>
            <li><a href="#quick-start" class="toc-link block py-1">\u5FEB\u901F\u5F00\u59CB</a></li>
            <li><a href="#auth-format" class="toc-link block py-1">\u8BA4\u8BC1\u683C\u5F0F</a></li>
            <li><a href="#usage-modes" class="toc-link block py-1">\u4F7F\u7528\u6A21\u5F0F</a></li>
            <li><a href="#examples" class="toc-link block py-1">\u4EE3\u7801\u793A\u4F8B</a></li>
            <li><a href="#sdk-config" class="toc-link block py-1">SDK \u914D\u7F6E</a></li>
            <li><a href="#errors" class="toc-link block py-1">\u9519\u8BEF\u5904\u7406</a></li>
            <li><a href="#deployment" class="toc-link block py-1">\u90E8\u7F72\u6307\u5357</a></li>
            <li><a href="#faq" class="toc-link block py-1">\u5E38\u89C1\u95EE\u9898</a></li>
          </ul>
        </nav>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 min-w-0">
        <!-- Overview -->
        <section id="overview" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-info-circle mr-2 text-purple-600"></i>\u6982\u8FF0</h2>
          <p class="text-gray-600 mb-4">AnyRouter \u662F\u4E00\u4E2A\u8FD0\u884C\u5728 Cloudflare Workers \u4E0A\u7684<strong>\u901A\u7528 API \u4EE3\u7406\u670D\u52A1</strong>\uFF0C\u53EF\u4EE5\u8F6C\u53D1\u4EFB\u610F HTTP API \u8BF7\u6C42\uFF1A</p>
          <ul class="space-y-2 text-gray-600">
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>\u901A\u7528\u4EE3\u7406</strong>\uFF1A\u652F\u6301\u4EFB\u610F HTTP/HTTPS API\uFF0C\u4E0D\u9650\u4E8E AI \u670D\u52A1</li>
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>\u5BC6\u94A5\u7BA1\u7406</strong>\uFF1A\u7EDF\u4E00\u7BA1\u7406\u591A\u4E2A API \u5BC6\u94A5\uFF0C\u901A\u8FC7\u77ED ID \u5B89\u5168\u8BBF\u95EE</li>
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>\u76F4\u4F20\u6A21\u5F0F</strong>\uFF1A\u65E0\u9700\u9884\u5148\u914D\u7F6E\uFF0C\u76F4\u63A5\u4F20\u9012 Token \u5373\u53EF\u4F7F\u7528</li>
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>\u8FB9\u7F18\u52A0\u901F</strong>\uFF1A\u57FA\u4E8E Cloudflare \u5168\u7403\u8FB9\u7F18\u7F51\u7EDC\uFF0C\u4F4E\u5EF6\u8FDF\u8BBF\u95EE</li>
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>\u8BF7\u6C42\u7EDF\u8BA1</strong>\uFF1A\u8BB0\u5F55\u4F7F\u7528\u91CF\uFF0C\u652F\u6301\u6309 API \u548C Key \u7EDF\u8BA1</li>
          </ul>
        </section>

        <!-- Supported APIs -->
        <section id="supported-apis" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-plug mr-2 text-purple-600"></i>\u652F\u6301\u7684 API</h2>
          <p class="text-gray-600 mb-4">AnyRouter \u652F\u6301\u4EFB\u610F HTTP API\uFF0C\u4EE5\u4E0B\u662F\u5E38\u7528\u7684 AI \u670D\u52A1\u793A\u4F8B\uFF1A</p>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div class="api-card bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <i class="fas fa-brain text-white text-sm"></i>
                </div>
                <span class="font-semibold text-green-800 text-sm">OpenAI</span>
              </div>
              <code class="text-xs text-green-600 break-all">api.openai.com</code>
            </div>

            <div class="api-card bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-3 border border-orange-200">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                  <i class="fas fa-robot text-white text-sm"></i>
                </div>
                <span class="font-semibold text-orange-800 text-sm">Anthropic</span>
              </div>
              <code class="text-xs text-orange-600 break-all">api.anthropic.com</code>
            </div>

            <div class="api-card bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <i class="fab fa-google text-white text-sm"></i>
                </div>
                <span class="font-semibold text-blue-800 text-sm">Google AI</span>
              </div>
              <code class="text-xs text-blue-600 break-all">generativelanguage.googleapis.com</code>
            </div>

            <div class="api-card bg-gradient-to-br from-cyan-50 to-sky-50 rounded-lg p-3 border border-cyan-200">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
                  <i class="fab fa-microsoft text-white text-sm"></i>
                </div>
                <span class="font-semibold text-cyan-800 text-sm">Azure OpenAI</span>
              </div>
              <code class="text-xs text-cyan-600 break-all">xxx.openai.azure.com</code>
            </div>

            <div class="api-card bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg p-3 border border-purple-200">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                  <i class="fas fa-bolt text-white text-sm"></i>
                </div>
                <span class="font-semibold text-purple-800 text-sm">Groq</span>
              </div>
              <code class="text-xs text-purple-600 break-all">api.groq.com</code>
            </div>

            <div class="api-card bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg p-3 border border-pink-200">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center">
                  <i class="fas fa-fire text-white text-sm"></i>
                </div>
                <span class="font-semibold text-pink-800 text-sm">Mistral</span>
              </div>
              <code class="text-xs text-pink-600 break-all">api.mistral.ai</code>
            </div>

            <div class="api-card bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg p-3 border border-yellow-200">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
                  <i class="fas fa-sun text-white text-sm"></i>
                </div>
                <span class="font-semibold text-yellow-800 text-sm">Cohere</span>
              </div>
              <code class="text-xs text-yellow-600 break-all">api.cohere.ai</code>
            </div>

            <div class="api-card bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg p-3 border border-gray-200">
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 bg-gray-500 rounded-lg flex items-center justify-center">
                  <i class="fas fa-ellipsis-h text-white text-sm"></i>
                </div>
                <span class="font-semibold text-gray-800 text-sm">\u66F4\u591A...</span>
              </div>
              <code class="text-xs text-gray-600">\u4EFB\u610F HTTP API</code>
            </div>
          </div>

          <div class="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p class="text-sm text-blue-700"><i class="fas fa-info-circle mr-1"></i>\u53EA\u8981\u662F\u6807\u51C6\u7684 HTTP/HTTPS API\uFF0C\u90FD\u53EF\u4EE5\u901A\u8FC7 AnyRouter \u4EE3\u7406\u8BBF\u95EE\uFF0C\u4E0D\u9650\u4E8E\u4E0A\u8FF0\u670D\u52A1\u3002</p>
          </div>
        </section>

        <!-- Quick Start -->
        <section id="quick-start" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-bolt mr-2 text-purple-600"></i>\u5FEB\u901F\u5F00\u59CB</h2>
          <div class="space-y-4">
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">1. \u83B7\u53D6\u4EE3\u7406\u5730\u5740</h3>
              <p class="text-gray-600 mb-2">\u5F53\u524D\u670D\u52A1\u5730\u5740\uFF1A</p>
              <div class="code-block relative">
                <pre><code class="language-text" id="proxyUrl"></code></pre>
                <button onclick="copyToClipboard('proxyUrl')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            </div>
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">2. \u8BBE\u7F6E\u8BA4\u8BC1\u4FE1\u606F</h3>
              <p class="text-gray-600">\u5728\u8BF7\u6C42\u5934\u4E2D\u6DFB\u52A0 <code class="bg-gray-100 px-2 py-1 rounded text-purple-600">Authorization</code> \u5B57\u6BB5\uFF0C\u683C\u5F0F\u5982\u4E0B\uFF1A</p>
            </div>
          </div>
        </section>

        <!-- Auth Format -->
        <section id="auth-format" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-key mr-2 text-purple-600"></i>\u8BA4\u8BC1\u683C\u5F0F</h2>
          <div class="code-block relative mb-4">
            <pre><code class="language-http">Authorization: Bearer &lt;\u76EE\u6807API\u5730\u5740&gt;:&lt;Key ID \u6216 Token&gt;</code></pre>
          </div>
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h4 class="font-semibold text-yellow-800 mb-2"><i class="fas fa-lightbulb mr-1"></i>\u683C\u5F0F\u8BF4\u660E</h4>
            <ul class="text-sm text-yellow-700 space-y-1">
              <li>\u2022 <strong>\u76EE\u6807API\u5730\u5740</strong>\uFF1A\u5B8C\u6574\u7684 API \u5730\u5740\uFF0C\u5982 <code>https://api.openai.com</code></li>
              <li>\u2022 <strong>Key ID</strong>\uFF1A6 \u4F4D\u5B57\u6BCD\u6570\u5B57\u7EC4\u5408\uFF0C\u7528\u4E8E\u4ECE\u6570\u636E\u5E93\u67E5\u627E\u5BF9\u5E94\u7684 Token</li>
              <li>\u2022 <strong>Token</strong>\uFF1A\u76F4\u63A5\u4F20\u9012\u5B8C\u6574\u7684 API Token\uFF08\u76F4\u4F20\u6A21\u5F0F\uFF09</li>
            </ul>
          </div>

          <h3 class="font-semibold text-gray-800 mb-2">\u5404\u5E73\u53F0\u793A\u4F8B</h3>
          <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2 p-2 bg-gray-50 rounded">
              <span class="w-20 text-gray-500">OpenAI:</span>
              <code class="text-green-600">Bearer https://api.openai.com:a3x9k2</code>
            </div>
            <div class="flex items-center gap-2 p-2 bg-gray-50 rounded">
              <span class="w-20 text-gray-500">Anthropic:</span>
              <code class="text-orange-600">Bearer https://api.anthropic.com:b4y8m1</code>
            </div>
            <div class="flex items-center gap-2 p-2 bg-gray-50 rounded">
              <span class="w-20 text-gray-500">Google AI:</span>
              <code class="text-blue-600">Bearer https://generativelanguage.googleapis.com:c5z2n3</code>
            </div>
            <div class="flex items-center gap-2 p-2 bg-gray-50 rounded">
              <span class="w-20 text-gray-500">Groq:</span>
              <code class="text-purple-600">Bearer https://api.groq.com:d6w4p5</code>
            </div>
          </div>
        </section>

        <!-- Usage Modes -->
        <section id="usage-modes" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-exchange-alt mr-2 text-purple-600"></i>\u4F7F\u7528\u6A21\u5F0F</h2>

          <div class="grid md:grid-cols-3 gap-4">
            <!-- SK Alias Mode -->
            <div class="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-4 border-2 border-orange-300">
              <div class="flex items-center mb-3">
                <span class="px-2 py-1 bg-orange-500 text-white text-xs rounded-full font-bold mr-2">\u6700\u4F73</span>
                <h3 class="font-bold text-orange-800">SK \u522B\u540D\u6A21\u5F0F</h3>
              </div>
              <p class="text-sm text-orange-700 mb-3">\u4F7F\u7528\u7C7B\u4F3C OpenAI \u683C\u5F0F\u7684 SK \u522B\u540D\uFF0C\u4E00\u952E\u8BBF\u95EE</p>
              <div class="code-block">
                <pre><code class="language-text">Bearer sk-ar-xxxxxxxx...</code></pre>
              </div>
              <ul class="mt-3 text-xs text-orange-600 space-y-1">
                <li><i class="fas fa-star mr-1"></i>\u7C7B\u4F3C\u539F\u751F API Key \u683C\u5F0F</li>
                <li><i class="fas fa-shield-alt mr-1"></i>\u4E0D\u66B4\u9732\u771F\u5B9E Token</li>
                <li><i class="fas fa-magic mr-1"></i>\u81EA\u52A8\u8BC6\u522B\u76EE\u6807 API</li>
                <li><i class="fas fa-sync mr-1"></i>\u53EF\u968F\u65F6\u91CD\u65B0\u751F\u6210</li>
              </ul>
            </div>

            <!-- Key ID Mode -->
            <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
              <div class="flex items-center mb-3">
                <span class="px-2 py-1 bg-blue-500 text-white text-xs rounded-full font-bold mr-2">\u63A8\u8350</span>
                <h3 class="font-bold text-blue-800">Key ID \u6A21\u5F0F</h3>
              </div>
              <p class="text-sm text-blue-700 mb-3">\u4F7F\u7528 6 \u4F4D\u77ED ID + URL \u8BBF\u95EE\u9884\u914D\u7F6E\u7684\u5BC6\u94A5</p>
              <div class="code-block">
                <pre><code class="language-text">Bearer https://api.openai.com:a3x9k2</code></pre>
              </div>
              <ul class="mt-3 text-xs text-blue-600 space-y-1">
                <li><i class="fas fa-shield-alt mr-1"></i>\u4E0D\u66B4\u9732\u771F\u5B9E Token</li>
                <li><i class="fas fa-tachometer-alt mr-1"></i>\u652F\u6301\u4F7F\u7528\u7EDF\u8BA1</li>
                <li><i class="fas fa-toggle-on mr-1"></i>\u53EF\u968F\u65F6\u542F\u7528/\u7981\u7528</li>
              </ul>
            </div>

            <!-- Direct Mode -->
            <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
              <div class="flex items-center mb-3">
                <span class="px-2 py-1 bg-green-500 text-white text-xs rounded-full font-bold mr-2">\u7075\u6D3B</span>
                <h3 class="font-bold text-green-800">\u76F4\u4F20\u6A21\u5F0F</h3>
              </div>
              <p class="text-sm text-green-700 mb-3">\u76F4\u63A5\u5728\u8BF7\u6C42\u4E2D\u4F20\u9012 API Token</p>
              <div class="code-block">
                <pre><code class="language-text">Bearer https://api.openai.com:sk-xxx...</code></pre>
              </div>
              <ul class="mt-3 text-xs text-green-600 space-y-1">
                <li><i class="fas fa-bolt mr-1"></i>\u5373\u7528\u5373\u8D70\uFF0C\u65E0\u9700\u914D\u7F6E</li>
                <li><i class="fas fa-globe mr-1"></i>\u652F\u6301\u4EFB\u610F API \u5730\u5740</li>
                <li><i class="fas fa-clock mr-1"></i>\u4E34\u65F6\u4F7F\u7528\u573A\u666F</li>
              </ul>
            </div>
          </div>

          <div class="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 class="font-semibold text-purple-800 mb-2"><i class="fas fa-magic mr-1"></i>\u6A21\u5F0F\u81EA\u52A8\u5224\u65AD</h4>
            <p class="text-sm text-purple-700">\u7CFB\u7EDF\u4F1A\u6839\u636E Authorization \u5185\u5BB9\u81EA\u52A8\u5224\u65AD\u6A21\u5F0F\uFF1A</p>
            <ul class="text-sm text-purple-600 mt-2 space-y-1">
              <li>\u2022 <code>sk-ar-xxx</code> \u5F00\u5934 \u2192 SK \u522B\u540D\u6A21\u5F0F\uFF08\u81EA\u52A8\u5339\u914D\u76EE\u6807 API\uFF09</li>
              <li>\u2022 URL \u540E\u8DDF 6 \u4F4D\u5B57\u6BCD\u6570\u5B57\uFF08\u5982 <code>https://...:a3x9k2</code>\uFF09\u2192 Key ID \u6A21\u5F0F</li>
              <li>\u2022 URL \u540E\u8DDF\u5176\u4ED6\u683C\u5F0F\uFF08\u5982 <code>https://...:sk-xxx</code>\uFF09\u2192 \u76F4\u4F20\u6A21\u5F0F</li>
            </ul>
          </div>

          <!-- SK Alias Details -->
          <div class="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h4 class="font-semibold text-orange-800 mb-2"><i class="fas fa-key mr-1"></i>SK \u522B\u540D\u8BE6\u89E3</h4>
            <p class="text-sm text-orange-700 mb-3">SK \u522B\u540D\u662F AnyRouter \u72EC\u521B\u7684\u8BA4\u8BC1\u65B9\u5F0F\uFF0C\u683C\u5F0F\u7C7B\u4F3C\u5404\u5927\u5E73\u53F0\u7684 API Key\uFF1A</p>
            <div class="grid md:grid-cols-2 gap-3 text-sm">
              <div class="bg-white rounded p-3">
                <div class="font-medium text-gray-700 mb-1">\u683C\u5F0F\u5BF9\u6BD4</div>
                <ul class="text-xs text-gray-600 space-y-1">
                  <li>OpenAI: <code class="text-green-600">sk-proj-xxx</code></li>
                  <li>Anthropic: <code class="text-orange-600">sk-ant-xxx</code></li>
                  <li>AnyRouter: <code class="text-purple-600">sk-ar-xxx</code></li>
                </ul>
              </div>
              <div class="bg-white rounded p-3">
                <div class="font-medium text-gray-700 mb-1">\u4F7F\u7528\u65B9\u6CD5</div>
                <ol class="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                  <li>\u5728\u7BA1\u7406\u9762\u677F\u70B9\u51FB\u300C\u751F\u6210\u300D\u83B7\u53D6 SK \u522B\u540D</li>
                  <li>\u76F4\u63A5\u7528 <code>sk-ar-xxx</code> \u4F5C\u4E3A API Key</li>
                  <li>\u65E0\u9700\u6307\u5B9A\u76EE\u6807 API URL</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <!-- Code Examples -->
        <section id="examples" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-code mr-2 text-purple-600"></i>\u4EE3\u7801\u793A\u4F8B</h2>

          <!-- cURL -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-gray-500"></i>cURL - OpenAI</h3>
            <div class="code-block relative">
              <pre><code class="language-bash" id="curl-openai">curl -X POST '<span class="proxy-url"></span>/v1/chat/completions' \\
  -H 'Authorization: Bearer https://api.openai.com:a3x9k2' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'</code></pre>
              <button onclick="copyCode('curl-openai')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- cURL Anthropic -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-gray-500"></i>cURL - Anthropic</h3>
            <div class="code-block relative">
              <pre><code class="language-bash" id="curl-anthropic">curl -X POST '<span class="proxy-url"></span>/v1/messages' \\
  -H 'Authorization: Bearer https://api.anthropic.com:b4y8m1' \\
  -H 'Content-Type: application/json' \\
  -H 'anthropic-version: 2023-06-01' \\
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'</code></pre>
              <button onclick="copyCode('curl-anthropic')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- cURL Google -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-gray-500"></i>cURL - Google AI (Gemini)</h3>
            <div class="code-block relative">
              <pre><code class="language-bash" id="curl-google">curl -X POST '<span class="proxy-url"></span>/v1beta/models/gemini-pro:generateContent' \\
  -H 'Authorization: Bearer https://generativelanguage.googleapis.com:c5z2n3' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'</code></pre>
              <button onclick="copyCode('curl-google')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- Python OpenAI -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fab fa-python mr-2 text-blue-500"></i>Python - OpenAI SDK</h3>
            <div class="code-block relative">
              <pre><code class="language-python" id="python-openai">from openai import OpenAI

client = OpenAI(
    base_url='<span class="proxy-url"></span>/v1',
    api_key='https://api.openai.com:a3x9k2'
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)</code></pre>
              <button onclick="copyCode('python-openai')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- Python Anthropic -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fab fa-python mr-2 text-blue-500"></i>Python - Anthropic SDK</h3>
            <div class="code-block relative">
              <pre><code class="language-python" id="python-anthropic">import anthropic

client = anthropic.Anthropic(
    base_url='<span class="proxy-url"></span>',
    api_key='https://api.anthropic.com:b4y8m1'
)

message = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}]
)
print(message.content[0].text)</code></pre>
              <button onclick="copyCode('python-anthropic')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- Python Groq -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fab fa-python mr-2 text-blue-500"></i>Python - Groq SDK</h3>
            <div class="code-block relative">
              <pre><code class="language-python" id="python-groq">from groq import Groq

client = Groq(
    base_url='<span class="proxy-url"></span>/openai/v1',
    api_key='https://api.groq.com:d6w4p5'
)

response = client.chat.completions.create(
    model="llama-3.1-70b-versatile",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)</code></pre>
              <button onclick="copyCode('python-groq')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- JavaScript -->
          <div>
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fab fa-js mr-2 text-yellow-500"></i>JavaScript - fetch</h3>
            <div class="code-block relative">
              <pre><code class="language-javascript" id="js-example">const response = await fetch('<span class="proxy-url"></span>/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer https://api.openai.com:a3x9k2',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);</code></pre>
              <button onclick="copyCode('js-example')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>
        </section>

        <!-- SDK Config -->
        <section id="sdk-config" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-cogs mr-2 text-purple-600"></i>SDK / CLI \u914D\u7F6E</h2>
          <p class="text-gray-600 mb-4">\u901A\u8FC7\u73AF\u5883\u53D8\u91CF\u914D\u7F6E\u5404\u79CD SDK \u548C CLI \u5DE5\u5177\u4F7F\u7528\u672C\u4EE3\u7406\u670D\u52A1\uFF1A</p>

          <!-- SK Alias Mode (Recommended) -->
          <div class="mb-6 p-4 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300 rounded-lg">
            <h3 class="font-semibold text-orange-800 mb-2"><i class="fas fa-star mr-2 text-orange-500"></i>SK \u522B\u540D\u6A21\u5F0F\uFF08\u63A8\u8350\uFF09</h3>
            <p class="text-sm text-orange-700 mb-3">\u4F7F\u7528 SK \u522B\u540D\u6700\u7B80\u6D01\uFF0C\u65E0\u9700\u6307\u5B9A\u76EE\u6807 API URL\uFF1A</p>
            <div class="code-block relative mb-2">
              <pre><code class="language-bash" id="config-sk-alias"># Claude Code / Anthropic SDK
export ANTHROPIC_BASE_URL=<span class="proxy-url"></span>
export ANTHROPIC_AUTH_TOKEN=sk-ar-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI SDK
export OPENAI_BASE_URL=<span class="proxy-url"></span>/v1
export OPENAI_API_KEY=sk-ar-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code></pre>
              <button onclick="copyCode('config-sk-alias')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
            <p class="text-xs text-orange-600"><i class="fas fa-info-circle mr-1"></i>\u5728\u7BA1\u7406\u9762\u677F\u7684\u914D\u7F6E\u5217\u8868\u4E2D\u70B9\u51FB\u300C\u751F\u6210\u300D\u6309\u94AE\u83B7\u53D6\u4F60\u7684 SK \u522B\u540D</p>
          </div>

          <!-- Claude Code -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-orange-500"></i>Claude Code CLI\uFF08Key ID \u6A21\u5F0F\uFF09</h3>
            <div class="code-block relative mb-2">
              <pre><code class="language-bash" id="config-claude">export ANTHROPIC_BASE_URL=<span class="proxy-url"></span>
export ANTHROPIC_AUTH_TOKEN=https://api.anthropic.com:b4y8m1</code></pre>
              <button onclick="copyCode('config-claude')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- OpenAI CLI -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-green-500"></i>OpenAI CLI / SDK\uFF08Key ID \u6A21\u5F0F\uFF09</h3>
            <div class="code-block relative mb-2">
              <pre><code class="language-bash" id="config-openai">export OPENAI_BASE_URL=<span class="proxy-url"></span>/v1
export OPENAI_API_KEY=https://api.openai.com:a3x9k2</code></pre>
              <button onclick="copyCode('config-openai')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- Generic -->
          <div class="mb-4">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-purple-500"></i>\u901A\u7528\u914D\u7F6E\u6A21\u5F0F</h3>
            <div class="code-block relative mb-2">
              <pre><code class="language-bash" id="config-generic"># SK \u522B\u540D\u6A21\u5F0F\uFF08\u6700\u7B80\u6D01\uFF09
export {SDK}_BASE_URL=<span class="proxy-url"></span>
export {SDK}_API_KEY=sk-ar-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Key ID \u6A21\u5F0F
export {SDK}_BASE_URL=<span class="proxy-url"></span>
export {SDK}_API_KEY=https://{\u76EE\u6807API\u5730\u5740}:{KeyID}</code></pre>
              <button onclick="copyCode('config-generic')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 class="font-semibold text-blue-800 mb-2"><i class="fas fa-info-circle mr-1"></i>\u914D\u7F6E\u8BF4\u660E</h4>
            <ul class="text-sm text-blue-700 space-y-1">
              <li>\u2022 <strong>SK \u522B\u540D\u6A21\u5F0F</strong>\uFF1A\u6700\u7B80\u6D01\uFF0C\u53EA\u9700\u4E00\u4E2A <code>sk-ar-xxx</code> \u5373\u53EF\uFF0C\u7CFB\u7EDF\u81EA\u52A8\u8BC6\u522B\u76EE\u6807 API</li>
              <li>\u2022 <strong>Key ID \u6A21\u5F0F</strong>\uFF1A\u9700\u8981\u6307\u5B9A URL \u548C 6 \u4F4D Key ID\uFF0C\u9002\u5408\u9700\u8981\u660E\u786E\u6307\u5B9A\u76EE\u6807\u7684\u573A\u666F</li>
              <li>\u2022 \u73AF\u5883\u53D8\u91CF\u53EF\u4EE5\u6DFB\u52A0\u5230 <code>~/.bashrc</code>\u3001<code>~/.zshrc</code> \u6216\u9879\u76EE\u7684 <code>.env</code> \u6587\u4EF6</li>
            </ul>
          </div>
        </section>

        <!-- Errors -->
        <section id="errors" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-exclamation-triangle mr-2 text-purple-600"></i>\u9519\u8BEF\u5904\u7406</h2>
          <p class="text-gray-600 mb-4">\u5F53\u8BF7\u6C42\u51FA\u9519\u65F6\uFF0CAPI \u4F1A\u8FD4\u56DE\u7ED3\u6784\u5316\u7684\u9519\u8BEF\u4FE1\u606F\uFF1A</p>

          <div class="code-block mb-4">
            <pre><code class="language-json">{
  "error": {
    "code": "NOT_FOUND",
    "message": "Key ID \u4E0D\u5B58\u5728",
    "hint": "\u627E\u4E0D\u5230 Key ID \\"abc123\\"\uFF0C\u8BF7\u68C0\u67E5\u662F\u5426\u8F93\u5165\u6B63\u786E",
    "contact": "\u5982\u6709\u7591\u95EE\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458"
  }
}</code></pre>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200">
                  <th class="text-left py-2 px-3 font-semibold text-gray-700">\u9519\u8BEF\u7801</th>
                  <th class="text-left py-2 px-3 font-semibold text-gray-700">HTTP \u72B6\u6001</th>
                  <th class="text-left py-2 px-3 font-semibold text-gray-700">\u8BF4\u660E</th>
                </tr>
              </thead>
              <tbody class="text-gray-600">
                <tr class="border-b border-gray-100">
                  <td class="py-2 px-3"><code class="text-red-600">UNAUTHORIZED</code></td>
                  <td class="py-2 px-3">401</td>
                  <td class="py-2 px-3">\u7F3A\u5C11\u6216\u65E0\u6548\u7684 Authorization header</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 px-3"><code class="text-red-600">BAD_REQUEST</code></td>
                  <td class="py-2 px-3">400</td>
                  <td class="py-2 px-3">\u8BF7\u6C42\u683C\u5F0F\u9519\u8BEF</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 px-3"><code class="text-red-600">NOT_FOUND</code></td>
                  <td class="py-2 px-3">404</td>
                  <td class="py-2 px-3">API \u5730\u5740\u672A\u914D\u7F6E\u6216 Key ID \u4E0D\u5B58\u5728</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 px-3"><code class="text-red-600">FORBIDDEN</code></td>
                  <td class="py-2 px-3">403</td>
                  <td class="py-2 px-3">Key \u5DF2\u88AB\u7981\u7528</td>
                </tr>
                <tr>
                  <td class="py-2 px-3"><code class="text-red-600">SERVICE_ERROR</code></td>
                  <td class="py-2 px-3">503</td>
                  <td class="py-2 px-3">\u65E0\u6CD5\u8FDE\u63A5\u5230\u76EE\u6807 API</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Deployment Guide -->
        <section id="deployment" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-server mr-2 text-purple-600"></i>\u90E8\u7F72\u6307\u5357</h2>
          <p class="text-gray-600 mb-4">\u9009\u62E9\u4EE5\u4E0B\u4EFB\u4E00\u65B9\u5F0F\u90E8\u7F72\u4F60\u7684 AnyRouter \u4EE3\u7406\u670D\u52A1\uFF1A</p>

          <!-- Deploy Methods Tabs -->
          <div class="mb-6">
            <div class="flex border-b border-gray-200 mb-4">
              <button onclick="showDeployTab('oneclick')" id="tab-oneclick" class="deploy-tab px-4 py-2 text-sm font-medium text-purple-600 border-b-2 border-purple-600">
                <i class="fas fa-bolt mr-1"></i>\u4E00\u952E\u90E8\u7F72
              </button>
              <button onclick="showDeployTab('github')" id="tab-github" class="deploy-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-600">
                <i class="fab fa-github mr-1"></i>GitHub \u5173\u8054
              </button>
              <button onclick="showDeployTab('paste')" id="tab-paste" class="deploy-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-600">
                <i class="fas fa-paste mr-1"></i>\u590D\u5236\u7C98\u8D34
              </button>
              <button onclick="showDeployTab('cli')" id="tab-cli" class="deploy-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-600">
                <i class="fas fa-terminal mr-1"></i>\u547D\u4EE4\u884C\u90E8\u7F72
              </button>
              <button onclick="showDeployTab('actions')" id="tab-actions" class="deploy-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-600">
                <i class="fas fa-cogs mr-1"></i>GitHub Actions
              </button>
            </div>

            <!-- One-Click Deploy -->
            <div id="deploy-oneclick" class="deploy-content">
              <div class="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-orange-800 mb-2"><i class="fas fa-star mr-1"></i>\u6700\u7B80\u5355\u7684\u65B9\u5F0F</h4>
                <p class="text-sm text-orange-700 mb-3">\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\uFF0C\u81EA\u52A8 Fork \u5E76\u90E8\u7F72\u5230\u4F60\u7684 Cloudflare \u8D26\u6237\uFF1A</p>
                <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/dext7r/anyrouter" target="_blank" class="inline-block">
                  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" class="h-10">
                </a>
              </div>
              <div class="text-sm text-gray-600">
                <p class="mb-2"><strong>\u90E8\u7F72\u540E\u914D\u7F6E\u73AF\u5883\u53D8\u91CF\uFF1A</strong></p>
                <ol class="list-decimal list-inside space-y-1 text-gray-500">
                  <li>\u8FDB\u5165 Cloudflare Dashboard \u2192 Workers & Pages \u2192 \u4F60\u7684 Worker</li>
                  <li>\u70B9\u51FB Settings \u2192 Variables and Secrets</li>
                  <li>\u6DFB\u52A0 <code class="bg-gray-100 px-1 rounded">ADMIN_PASSWORD</code>\u3001<code class="bg-gray-100 px-1 rounded">SUPABASE_URL</code> \u7B49\u53D8\u91CF</li>
                </ol>
              </div>
            </div>

            <!-- GitHub Integration -->
            <div id="deploy-github" class="deploy-content hidden">
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-blue-800 mb-2"><i class="fab fa-github mr-1"></i>\u5173\u8054 GitHub \u4ED3\u5E93\u81EA\u52A8\u90E8\u7F72</h4>
                <p class="text-sm text-blue-700">\u6BCF\u6B21\u63A8\u9001\u4EE3\u7801\u5230 GitHub\uFF0CCloudflare \u81EA\u52A8\u6784\u5EFA\u5E76\u90E8\u7F72</p>
              </div>
              <ol class="space-y-3 text-sm text-gray-600">
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">1.</span>
                  <div>Fork <a href="https://github.com/dext7r/anyrouter" target="_blank" class="text-purple-600 hover:underline">dext7r/anyrouter</a> \u5230\u4F60\u7684 GitHub \u8D26\u53F7</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">2.</span>
                  <div>\u767B\u5F55 <a href="https://dash.cloudflare.com" target="_blank" class="text-purple-600 hover:underline">Cloudflare Dashboard</a> \u2192 Workers & Pages \u2192 <strong>Create</strong></div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">3.</span>
                  <div>\u9009\u62E9 <strong>Workers</strong> \u2192 <strong>Import from GitHub</strong></div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">4.</span>
                  <div>\u6388\u6743 GitHub \u5E76\u9009\u62E9\u4F60 Fork \u7684\u4ED3\u5E93</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">5.</span>
                  <div>\u4F7F\u7528\u9ED8\u8BA4\u914D\u7F6E\uFF0C\u76F4\u63A5\u70B9\u51FB<strong>\u90E8\u7F72</strong>\uFF08\u4ED3\u5E93\u5DF2\u5305\u542B wrangler.toml\uFF09</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">6.</span>
                  <div>\u90E8\u7F72\u5B8C\u6210\u540E\uFF0C\u8FDB\u5165 Settings \u2192 Variables and Secrets \u6DFB\u52A0\u73AF\u5883\u53D8\u91CF</div>
                </li>
              </ol>
            </div>

            <!-- Paste Deploy -->
            <div id="deploy-paste" class="deploy-content hidden">
              <div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-green-800 mb-2"><i class="fas fa-paste mr-1"></i>\u76F4\u63A5\u590D\u5236\u4EE3\u7801\u90E8\u7F72</h4>
                <p class="text-sm text-green-700">\u65E0\u9700 Git\uFF0C\u76F4\u63A5\u590D\u5236\u6784\u5EFA\u540E\u7684\u4EE3\u7801\u5230 Cloudflare Workers</p>
              </div>
              <ol class="space-y-3 text-sm text-gray-600">
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">1.</span>
                  <div>\u767B\u5F55 <a href="https://dash.cloudflare.com" target="_blank" class="text-purple-600 hover:underline">Cloudflare Dashboard</a> \u2192 Workers & Pages \u2192 <strong>Create</strong></div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">2.</span>
                  <div>\u9009\u62E9 <strong>Workers</strong> \u2192 <strong>Create Worker</strong>\uFF08\u6216 Hello World \u6A21\u677F\uFF09</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">3.</span>
                  <div>\u7ED9 Worker \u8D77\u540D\uFF08\u5982 <code class="bg-gray-100 px-1 rounded">anyrouter</code>\uFF09\uFF0C\u70B9\u51FB <strong>Deploy</strong></div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">4.</span>
                  <div>\u70B9\u51FB <strong>Edit code</strong> \u8FDB\u5165\u5728\u7EBF\u7F16\u8F91\u5668</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">5.</span>
                  <div>
                    <strong>\u5220\u9664</strong>\u9ED8\u8BA4\u4EE3\u7801\uFF0C\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u4E00\u952E\u590D\u5236\u4EE3\u7801\uFF1A
                    <div class="mt-2 flex items-center gap-2 flex-wrap">
                      <button onclick="copyWorkerCode()" id="copyWorkerBtn" class="text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow">
                        <i class="fas fa-copy mr-1"></i>\u4E00\u952E\u590D\u5236 anyrouter.js
                      </button>
                      <a href="https://raw.githubusercontent.com/dext7r/anyrouter/main/anyrouter.js" target="_blank" class="text-xs text-purple-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>\u6216\u624B\u52A8\u6253\u5F00</a>
                    </div>
                    <p class="text-xs text-gray-400 mt-1" id="copyWorkerStatus"></p>
                  </div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">6.</span>
                  <div>\u70B9\u51FB\u53F3\u4E0A\u89D2 <strong>Deploy</strong> \u6309\u94AE</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">7.</span>
                  <div>\u8FD4\u56DE Worker \u8BBE\u7F6E\uFF0C\u6DFB\u52A0\u73AF\u5883\u53D8\u91CF\uFF08\u89C1\u4E0B\u65B9\u73AF\u5883\u53D8\u91CF\u914D\u7F6E\uFF09</div>
                </li>
              </ol>
              <div class="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p class="text-sm text-yellow-700"><i class="fas fa-lightbulb mr-1"></i><strong>\u63D0\u793A</strong>\uFF1A\u8FD9\u79CD\u65B9\u5F0F\u9002\u5408\u5FEB\u901F\u4F53\u9A8C\uFF0C\u4F46\u540E\u7EED\u66F4\u65B0\u9700\u8981\u624B\u52A8\u590D\u5236\u65B0\u4EE3\u7801\u3002\u63A8\u8350\u4F7F\u7528 GitHub \u5173\u8054\u65B9\u5F0F\u5B9E\u73B0\u81EA\u52A8\u66F4\u65B0\u3002</p>
              </div>
            </div>

            <!-- CLI Deploy -->
            <div id="deploy-cli" class="deploy-content hidden">
              <div class="code-block relative mb-4">
                <pre><code class="language-bash" id="deploy-clone"># \u514B\u9686\u4ED3\u5E93
git clone https://github.com/dext7r/anyrouter.git
cd anyrouter
npm install

# \u672C\u5730\u5F00\u53D1\uFF08\u53EF\u9009\uFF09
cp wrangler.toml.example wrangler.toml.local
# \u7F16\u8F91 wrangler.toml.local \u586B\u5165\u73AF\u5883\u53D8\u91CF
npx wrangler dev -c wrangler.toml.local

# \u90E8\u7F72\u5230 Cloudflare
npm run build
npx wrangler login  # \u9996\u6B21\u9700\u8981
npx wrangler deploy
# \u90E8\u7F72\u540E\u5728 Dashboard \u914D\u7F6E\u73AF\u5883\u53D8\u91CF</code></pre>
                <button onclick="copyCode('deploy-clone')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            </div>

            <!-- GitHub Actions -->
            <div id="deploy-actions" class="deploy-content hidden">
              <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-green-800 mb-2"><i class="fas fa-robot mr-1"></i>\u81EA\u52A8\u5316 CI/CD</h4>
                <p class="text-sm text-green-700">\u63A8\u9001\u5230 main \u5206\u652F\u65F6\u81EA\u52A8\u90E8\u7F72</p>
              </div>
              <p class="text-sm text-gray-600 mb-3">\u5728\u4ED3\u5E93\u4E2D\u521B\u5EFA <code class="bg-gray-100 px-1 rounded">.github/workflows/deploy.yml</code>\uFF1A</p>
              <div class="code-block relative mb-4">
                <pre><code class="language-yaml" id="deploy-actions-code">name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}</code></pre>
                <button onclick="copyCode('deploy-actions-code')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
              <div class="text-sm text-gray-600">
                <p class="mb-2"><strong>\u914D\u7F6E GitHub Secrets\uFF1A</strong></p>
                <ol class="list-decimal list-inside space-y-1 text-gray-500">
                  <li>\u5728 Cloudflare Dashboard \u2192 My Profile \u2192 API Tokens \u521B\u5EFA Token</li>
                  <li>\u6743\u9650\u9009\u62E9\uFF1AAccount - Cloudflare Workers Scripts - Edit</li>
                  <li>\u5728 GitHub \u4ED3\u5E93 Settings \u2192 Secrets \u2192 Actions \u6DFB\u52A0\uFF1A
                    <ul class="list-disc list-inside ml-4 mt-1">
                      <li><code class="bg-gray-100 px-1 rounded">CLOUDFLARE_API_TOKEN</code></li>
                      <li><code class="bg-gray-100 px-1 rounded">CLOUDFLARE_ACCOUNT_ID</code></li>
                    </ul>
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <!-- Prerequisites -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <i class="fas fa-clipboard-list mr-2 text-purple-600"></i>\u51C6\u5907\u5DE5\u4F5C
            </h3>
            <div class="bg-gray-50 rounded-lg p-4 text-sm">
              <ul class="space-y-2 text-gray-600">
                <li><i class="fas fa-check text-green-500 mr-2"></i>GitHub \u8D26\u53F7\uFF08\u7528\u4E8E Fork \u4EE3\u7801\u4ED3\u5E93\uFF09</li>
                <li><i class="fas fa-check text-green-500 mr-2"></i>Cloudflare \u8D26\u53F7\uFF08<a href="https://dash.cloudflare.com/sign-up" target="_blank" class="text-purple-600 hover:underline">\u514D\u8D39\u6CE8\u518C</a>\uFF09</li>
                <li><i class="fas fa-check text-green-500 mr-2"></i>Supabase \u8D26\u53F7\uFF08<a href="https://supabase.com" target="_blank" class="text-purple-600 hover:underline">\u514D\u8D39\u6CE8\u518C</a>\uFF0C\u53EF\u9009\uFF0C\u7528\u4E8E\u5BC6\u94A5\u7BA1\u7406\uFF09</li>
                <li><i class="fas fa-check text-green-500 mr-2"></i>Upstash \u8D26\u53F7\uFF08<a href="https://upstash.com" target="_blank" class="text-purple-600 hover:underline">\u514D\u8D39\u6CE8\u518C</a>\uFF0C\u53EF\u9009\uFF0C\u7528\u4E8E Redis \u7F13\u5B58\u548C\u7EDF\u8BA1\uFF09</li>
              </ul>
            </div>
          </div>

          <!-- Step 3: Supabase Setup -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm mr-2">3</span>
              \u914D\u7F6E Supabase \u6570\u636E\u5E93\uFF08\u53EF\u9009\uFF09
            </h3>
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
              <p class="text-sm text-green-700"><i class="fas fa-info-circle mr-1"></i>\u5982\u679C\u53EA\u9700\u8981\u76F4\u4F20\u6A21\u5F0F\uFF0C\u53EF\u8DF3\u8FC7\u6B64\u6B65\u9AA4</p>
            </div>
            <ol class="space-y-3 text-sm text-gray-600">
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">a.</span>
                \u767B\u5F55 <a href="https://supabase.com" target="_blank" class="text-purple-600 hover:underline">Supabase</a> \u5E76\u521B\u5EFA\u65B0\u9879\u76EE
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">b.</span>
                \u8FDB\u5165 SQL Editor\uFF0C\u6267\u884C\u6570\u636E\u5E93\u521D\u59CB\u5316\u811A\u672C\uFF1A
              </li>
            </ol>
            <div class="mt-3 border border-gray-200 rounded-lg overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all" onclick="toggleSchemaSQL()">
                <div class="flex items-center gap-2">
                  <i id="schemaSqlToggle" class="fas fa-chevron-right text-purple-600 text-xs transition-transform"></i>
                  <span class="text-xs text-gray-600 font-medium"><i class="fas fa-database mr-1"></i>schema.sql - \u4ECE GitHub \u5B9E\u65F6\u83B7\u53D6</span>
                </div>
                <div class="flex gap-2" onclick="event.stopPropagation()">
                  <a href="https://github.com/dext7r/anyrouter/blob/main/schema.sql" target="_blank" class="text-xs text-purple-600 hover:underline"><i class="fab fa-github mr-1"></i>\u67E5\u770B\u6E90\u6587\u4EF6</a>
                  <button onclick="loadSchemaSQL()" class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200"><i class="fas fa-sync-alt mr-1"></i>\u5237\u65B0</button>
                  <button onclick="copyCode('deploy-sql')" class="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700"><i class="fas fa-copy mr-1"></i>\u590D\u5236</button>
                </div>
              </div>
              <div id="schemaSqlContent" class="hidden">
                <div class="code-block relative rounded-none">
                  <pre style="max-height: 400px; overflow-y: auto;"><code class="language-sql" id="deploy-sql"><i class="fas fa-spinner fa-spin"></i> \u6B63\u5728\u4ECE GitHub \u52A0\u8F7D schema.sql...</code></pre>
                </div>
              </div>
              <p class="text-xs text-gray-500 px-3 py-2 bg-gray-50 border-t border-gray-200"><i class="fas fa-info-circle mr-1"></i>\u811A\u672C\u5305\u542B\uFF1A\u5EFA\u8868\u3001\u7D22\u5F15\u3001RLS \u7B56\u7565\u3001\u89E6\u53D1\u5668\u3001\u8FC1\u79FB\u903B\u8F91\uFF08\u652F\u6301\u5DF2\u6709\u8868\u5347\u7EA7\uFF09</p>
            </div>
            <ol class="space-y-3 text-sm text-gray-600 mt-3" start="3">
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">c.</span>
                \u8FDB\u5165 Settings \u2192 API\uFF0C\u83B7\u53D6 <code class="bg-gray-100 px-1 rounded">Project URL</code> \u548C <code class="bg-gray-100 px-1 rounded">anon/public key</code>
              </li>
            </ol>
          </div>

          <!-- Step 4: Upstash Setup -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm mr-2">4</span>
              \u914D\u7F6E Upstash Redis\uFF08\u53EF\u9009\uFF09
            </h3>
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
              <p class="text-sm text-green-700"><i class="fas fa-info-circle mr-1"></i>\u5982\u679C\u4E0D\u9700\u8981\u7EDF\u8BA1\u548C\u7F13\u5B58\u529F\u80FD\uFF0C\u53EF\u8DF3\u8FC7\u6B64\u6B65\u9AA4</p>
            </div>
            <ol class="space-y-3 text-sm text-gray-600">
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">a.</span>
                \u767B\u5F55 <a href="https://upstash.com" target="_blank" class="text-purple-600 hover:underline">Upstash</a> \u5E76\u521B\u5EFA Redis \u6570\u636E\u5E93
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">b.</span>
                \u9009\u62E9\u79BB\u4F60\u6700\u8FD1\u7684\u533A\u57DF\uFF08\u5982 US-East-1 \u6216 AP-Northeast-1\uFF09
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">c.</span>
                \u5728 REST API \u6807\u7B7E\u9875\u590D\u5236 <code class="bg-gray-100 px-1 rounded">UPSTASH_REDIS_REST_URL</code> \u548C <code class="bg-gray-100 px-1 rounded">UPSTASH_REDIS_REST_TOKEN</code>
              </li>
            </ol>
          </div>

          <!-- Step 5: Environment Variables -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm mr-2">5</span>
              \u914D\u7F6E\u73AF\u5883\u53D8\u91CF
            </h3>
            <p class="text-sm text-gray-600 mb-3">\u90E8\u7F72\u540E\u5728 Cloudflare Dashboard \u2192 Workers \u2192 \u4F60\u7684 Worker \u2192 Settings \u2192 Variables and Secrets \u6DFB\u52A0\uFF1A</p>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200">
                    <th class="text-left py-2 px-3 font-semibold text-gray-700">\u53D8\u91CF\u540D</th>
                    <th class="text-left py-2 px-3 font-semibold text-gray-700">\u5FC5\u987B</th>
                    <th class="text-left py-2 px-3 font-semibold text-gray-700">\u8BF4\u660E</th>
                    <th class="text-left py-2 px-3 font-semibold text-gray-700">\u83B7\u53D6\u65B9\u5F0F</th>
                  </tr>
                </thead>
                <tbody class="text-gray-600">
                  <tr class="border-b border-gray-100">
                    <td class="py-2 px-3"><code class="text-purple-600">ADMIN_PASSWORD</code></td>
                    <td class="py-2 px-3"><span class="text-green-600 font-bold">\u2713</span></td>
                    <td class="py-2 px-3">\u7BA1\u7406\u9762\u677F\u767B\u5F55\u5BC6\u7801</td>
                    <td class="py-2 px-3 text-gray-400">\u81EA\u5B9A\u4E49</td>
                  </tr>
                  <tr class="border-b border-gray-100">
                    <td class="py-2 px-3"><code class="text-purple-600">SUPABASE_URL</code></td>
                    <td class="py-2 px-3"><span class="text-gray-400">\u53EF\u9009</span></td>
                    <td class="py-2 px-3">Supabase \u9879\u76EE URL</td>
                    <td class="py-2 px-3 text-xs">Supabase \u2192 Settings \u2192 API \u2192 Project URL</td>
                  </tr>
                  <tr class="border-b border-gray-100">
                    <td class="py-2 px-3"><code class="text-purple-600">SUPABASE_KEY</code></td>
                    <td class="py-2 px-3"><span class="text-gray-400">\u53EF\u9009</span></td>
                    <td class="py-2 px-3">Supabase anon key</td>
                    <td class="py-2 px-3 text-xs">Supabase \u2192 Settings \u2192 API \u2192 anon public</td>
                  </tr>
                  <tr class="border-b border-gray-100">
                    <td class="py-2 px-3"><code class="text-purple-600">UPSTASH_REDIS_URL</code></td>
                    <td class="py-2 px-3"><span class="text-gray-400">\u53EF\u9009</span></td>
                    <td class="py-2 px-3">Upstash Redis REST URL</td>
                    <td class="py-2 px-3 text-xs">Upstash \u2192 Redis \u2192 REST API</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3"><code class="text-purple-600">UPSTASH_REDIS_TOKEN</code></td>
                    <td class="py-2 px-3"><span class="text-gray-400">\u53EF\u9009</span></td>
                    <td class="py-2 px-3">Upstash Redis Token</td>
                    <td class="py-2 px-3 text-xs">Upstash \u2192 Redis \u2192 REST API</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p class="text-sm text-blue-700"><i class="fas fa-info-circle mr-1"></i>\u4E0D\u914D\u7F6E Supabase/Redis \u4E5F\u53EF\u4F7F\u7528\u76F4\u4F20\u6A21\u5F0F</p>
            </div>
          </div>

          <!-- Step 6: Custom Domain -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm mr-2">6</span>
              \u914D\u7F6E\u81EA\u5B9A\u4E49\u57DF\u540D\uFF08\u53EF\u9009\uFF09
            </h3>
            <ol class="space-y-3 text-sm text-gray-600">
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">a.</span>
                \u767B\u5F55 Cloudflare Dashboard\uFF0C\u8FDB\u5165 Workers & Pages
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">b.</span>
                \u9009\u62E9\u4F60\u7684 Worker\uFF0C\u70B9\u51FB Settings \u2192 Triggers \u2192 Custom Domains
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">c.</span>
                \u6DFB\u52A0\u4F60\u7684\u57DF\u540D\uFF08\u57DF\u540D\u9700\u8981\u5DF2\u6DFB\u52A0\u5230 Cloudflare\uFF09
              </li>
            </ol>
          </div>

          <!-- Deployment Checklist -->
          <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 class="font-semibold text-purple-800 mb-2"><i class="fas fa-clipboard-check mr-1"></i>\u90E8\u7F72\u540E\u68C0\u67E5\u6E05\u5355</h4>
            <ul class="text-sm text-purple-700 space-y-1">
              <li><i class="fas fa-check-circle text-green-500 mr-1"></i>\u8BBF\u95EE <code>/</code> \u67E5\u770B\u72B6\u6001\u9875\u9762</li>
              <li><i class="fas fa-check-circle text-green-500 mr-1"></i>\u8BBF\u95EE <code>/admin</code> \u767B\u5F55\u7BA1\u7406\u9762\u677F</li>
              <li><i class="fas fa-check-circle text-green-500 mr-1"></i>\u6DFB\u52A0 API \u914D\u7F6E\u5E76\u6D4B\u8BD5\u4EE3\u7406\u529F\u80FD</li>
              <li><i class="fas fa-check-circle text-green-500 mr-1"></i>\u751F\u6210 SK \u522B\u540D\u7528\u4E8E SDK \u914D\u7F6E</li>
            </ul>
          </div>
        </section>

        <!-- FAQ -->
        <section id="faq" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-question-circle mr-2 text-purple-600"></i>\u5E38\u89C1\u95EE\u9898</h2>

          <div class="space-y-4">
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: \u5982\u4F55\u83B7\u53D6 Key ID\uFF1F</h3>
              <p class="text-gray-600 text-sm">\u767B\u5F55<a href="/admin" class="text-purple-600 hover:underline">\u7BA1\u7406\u9762\u677F</a>\uFF0C\u6DFB\u52A0 API \u914D\u7F6E\u540E\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u751F\u6210 6 \u4F4D Key ID\u3002</p>
            </div>
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: \u652F\u6301\u54EA\u4E9B API\uFF1F</h3>
              <p class="text-gray-600 text-sm">\u652F\u6301<strong>\u4EFB\u610F HTTP/HTTPS API</strong>\uFF0C\u5305\u62EC\u4F46\u4E0D\u9650\u4E8E\uFF1AOpenAI\u3001Anthropic\u3001Google AI\u3001Azure OpenAI\u3001Groq\u3001Mistral\u3001Cohere\u3001HuggingFace \u7B49\u3002</p>
            </div>
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: \u6570\u636E\u5B89\u5168\u5417\uFF1F</h3>
              <p class="text-gray-600 text-sm">\u4EE3\u7406\u670D\u52A1\u4E0D\u4F1A\u5B58\u50A8\u4EFB\u4F55\u8BF7\u6C42\u5185\u5BB9\uFF0C\u4EC5\u8F6C\u53D1\u8BF7\u6C42\u3002API Token \u5B58\u50A8\u5728\u6570\u636E\u5E93\u4E2D\uFF0C\u4F20\u8F93\u4F7F\u7528 HTTPS \u52A0\u5BC6\u3002</p>
            </div>
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: \u5982\u4F55\u81EA\u5DF1\u90E8\u7F72\uFF1F</h3>
              <p class="text-gray-600 text-sm">Fork <a href="https://github.com/dext7r/anyrouter" target="_blank" class="text-purple-600 hover:underline">GitHub \u4ED3\u5E93</a>\uFF0C\u914D\u7F6E Cloudflare Workers \u548C Supabase \u6570\u636E\u5E93\u5373\u53EF\u3002\u8BE6\u89C1\u4ED3\u5E93 README\u3002</p>
            </div>
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: \u6709\u8BF7\u6C42\u9650\u5236\u5417\uFF1F</h3>
              <p class="text-gray-600 text-sm">\u4EE3\u7406\u670D\u52A1\u672C\u8EAB\u65E0\u9650\u5236\uFF0C\u4F46\u4F1A\u53D7\u5230 Cloudflare Workers \u514D\u8D39\u7248\u7684\u9650\u5236\uFF08\u6BCF\u65E5 10 \u4E07\u8BF7\u6C42\uFF09\u548C\u76EE\u6807 API \u7684\u9650\u5236\u3002</p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">Q: \u4E3A\u4EC0\u4E48\u8981\u7528\u4EE3\u7406\u800C\u4E0D\u662F\u76F4\u8FDE\uFF1F</h3>
              <p class="text-gray-600 text-sm">1) \u7EDF\u4E00\u7BA1\u7406\u591A\u4E2A API \u5BC6\u94A5\uFF1B2) \u907F\u514D\u5728\u5BA2\u6237\u7AEF\u66B4\u9732 Token\uFF1B3) \u5229\u7528 Cloudflare \u8FB9\u7F18\u7F51\u7EDC\u52A0\u901F\uFF1B4) \u4FBF\u4E8E\u76D1\u63A7\u548C\u7EDF\u8BA1\u4F7F\u7528\u91CF\u3002</p>
            </div>
          </div>
        </section>

        <!-- Footer -->
        <footer class="text-center text-gray-500 text-sm py-8">
          <p>Made with <i class="fas fa-heart text-red-400"></i> by <a href="https://github.com/dext7r" target="_blank" class="text-purple-600 hover:underline">dext7r</a></p>
          <p class="mt-2">Powered by Cloudflare Workers</p>
        </footer>
      </main>
    </div>
  </div>

  <script>
    // \u8BBE\u7F6E\u4EE3\u7406 URL
    const proxyUrl = window.location.origin;
    document.getElementById('proxyUrl').textContent = proxyUrl;
    document.querySelectorAll('.proxy-url').forEach(el => el.textContent = proxyUrl);

    // \u4ECE GitHub \u52A0\u8F7D schema.sql
    const SCHEMA_SQL_URL = 'https://raw.githubusercontent.com/dext7r/anyrouter/main/schema.sql';
    let schemaSQL = '';

    async function loadSchemaSQL() {
      const el = document.getElementById('deploy-sql');
      el.innerHTML = '<i class="fas fa-spinner fa-spin"></i> \u6B63\u5728\u4ECE GitHub \u52A0\u8F7D...';
      try {
        const response = await fetch(SCHEMA_SQL_URL);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        schemaSQL = await response.text();
        el.textContent = schemaSQL;
        hljs.highlightElement(el);
        showToast('schema.sql \u52A0\u8F7D\u6210\u529F');
      } catch (e) {
        el.innerHTML = '-- \u52A0\u8F7D\u5931\u8D25: ' + e.message + '\\n-- \u8BF7\u8BBF\u95EE GitHub \u67E5\u770B\u5B8C\u6574\u811A\u672C:\\n-- https://github.com/dext7r/anyrouter/blob/main/schema.sql';
        console.error('Failed to load schema.sql:', e);
      }
    }

    // \u9875\u9762\u52A0\u8F7D\u65F6\u81EA\u52A8\u83B7\u53D6 schema.sql
    loadSchemaSQL();

    // \u6298\u53E0/\u5C55\u5F00 schema.sql
    function toggleSchemaSQL() {
      const content = document.getElementById('schemaSqlContent');
      const toggle = document.getElementById('schemaSqlToggle');
      if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        toggle.style.transform = 'rotate(90deg)';
      } else {
        content.classList.add('hidden');
        toggle.style.transform = 'rotate(0deg)';
      }
    }

    // \u590D\u5236 Worker \u4EE3\u7801
    const WORKER_JS_URL = 'https://raw.githubusercontent.com/dext7r/anyrouter/main/anyrouter.js';
    let workerCode = '';

    async function copyWorkerCode() {
      const btn = document.getElementById('copyWorkerBtn');
      const status = document.getElementById('copyWorkerStatus');
      const originalHTML = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>\u6B63\u5728\u83B7\u53D6...';
      status.textContent = '';

      try {
        // \u5982\u679C\u5DF2\u7F13\u5B58\u5219\u76F4\u63A5\u4F7F\u7528
        if (!workerCode) {
          const response = await fetch(WORKER_JS_URL);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          workerCode = await response.text();
        }

        await navigator.clipboard.writeText(workerCode);
        btn.innerHTML = '<i class="fas fa-check mr-1"></i>\u5DF2\u590D\u5236\uFF01';
        status.innerHTML = '<i class="fas fa-check-circle text-green-500 mr-1"></i>\u4EE3\u7801\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF0C\u8BF7\u7C98\u8D34\u5230 Cloudflare \u7F16\u8F91\u5668';
        showToast('Worker \u4EE3\u7801\u5DF2\u590D\u5236\uFF0C\u8BF7\u7C98\u8D34\u5230 Cloudflare');

        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.disabled = false;
        }, 3000);
      } catch (e) {
        btn.innerHTML = '<i class="fas fa-times mr-1"></i>\u590D\u5236\u5931\u8D25';
        status.innerHTML = '<i class="fas fa-exclamation-circle text-red-500 mr-1"></i>\u83B7\u53D6\u5931\u8D25: ' + e.message + '\uFF0C\u8BF7<a href="' + WORKER_JS_URL + '" target="_blank" class="text-purple-600 underline">\u624B\u52A8\u6253\u5F00</a>\u590D\u5236';
        console.error('Failed to copy worker code:', e);

        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.disabled = false;
        }, 3000);
      }
    }

    // \u4EE3\u7801\u9AD8\u4EAE
    hljs.highlightAll();

    // \u590D\u5236\u529F\u80FD
    function copyToClipboard(elementId) {
      const text = document.getElementById(elementId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        showToast('\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F');
      });
    }

    function copyCode(elementId) {
      const el = document.getElementById(elementId);
      let text = el.textContent;
      // \u5982\u679C\u662F schema.sql \u4E14\u5DF2\u52A0\u8F7D\uFF0C\u4F7F\u7528\u7F13\u5B58\u5185\u5BB9
      if (elementId === 'deploy-sql' && schemaSQL) {
        text = schemaSQL;
      } else {
        text = text.replace(/<span class="proxy-url"><\\/span>/g, proxyUrl);
      }
      navigator.clipboard.writeText(text).then(() => {
        showToast('\u4EE3\u7801\u5DF2\u590D\u5236');
      });
    }

    function showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 px-4 py-2 bg-gray-800 text-white rounded-lg shadow-lg z-50';
      toast.innerHTML = '<i class="fas fa-check-circle mr-2"></i>' + message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    // TOC \u5DE6\u53F3\u6536\u8D77/\u5C55\u5F00
    function toggleTOC() {
      const sidebar = document.getElementById('tocSidebar');
      sidebar.classList.toggle('collapsed');
    }

    // \u90E8\u7F72\u65B9\u5F0F Tab \u5207\u6362
    function showDeployTab(tabName) {
      // \u9690\u85CF\u6240\u6709\u5185\u5BB9
      document.querySelectorAll('.deploy-content').forEach(el => el.classList.add('hidden'));
      // \u91CD\u7F6E\u6240\u6709 tab \u6837\u5F0F
      document.querySelectorAll('.deploy-tab').forEach(el => {
        el.classList.remove('text-purple-600', 'border-b-2', 'border-purple-600');
        el.classList.add('text-gray-500');
      });
      // \u663E\u793A\u9009\u4E2D\u5185\u5BB9
      document.getElementById('deploy-' + tabName).classList.remove('hidden');
      // \u6FC0\u6D3B\u9009\u4E2D tab
      const activeTab = document.getElementById('tab-' + tabName);
      activeTab.classList.remove('text-gray-500');
      activeTab.classList.add('text-purple-600', 'border-b-2', 'border-purple-600');
    }

    // TOC \u9AD8\u4EAE
    const sections = document.querySelectorAll('.section');
    const tocLinks = document.querySelectorAll('.toc-link');

    window.addEventListener('scroll', () => {
      let current = '';
      sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (scrollY >= sectionTop - 100) {
          current = section.getAttribute('id');
        }
      });

      tocLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + current) {
          link.classList.add('active');
        }
      });
    });
  <\/script>
</body>
</html>`;
}

// src/index.js
var index_default = {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return handleCORS();
  }
  if (url.pathname === "/admin") {
    return new Response(getAdminHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  if (url.pathname === "/docs") {
    return new Response(getDocsHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  if (url.pathname.startsWith("/api/")) {
    return handleApiRequest(request, env, url);
  }
  if (request.method === "GET" && url.pathname === "/") {
    return new Response(getStatusHtml(), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  return handleProxyRequest(request, env, url, ctx);
}
export {
  index_default as default
};
