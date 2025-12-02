// ============ Supabase 数据库操作 ============

import {
  FALLBACK_CONFIG,
  CACHE_KEY,
  REDIS_CACHE_TTL_SECONDS,
  KV_CACHE_TTL_SECONDS,
} from '../config.js'
import { getCachedConfig, setConfigCache, invalidateAllCache } from '../cache/index.js'
import { getRedisClient } from '../cache/redis.js'

// 包装函数：清除所有缓存（内存 + Redis + KV）
async function clearAllCache(env) {
  await invalidateAllCache(env)
}

/**
 * 从 Supabase 获取配置（支持多级缓存）
 * 缓存优先级：内存(10min) -> Redis(5min) -> KV(5min,备用) -> 数据库
 */
export async function getConfigFromDB(env) {
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
        sk_alias: item.sk_alias || null,
        token: item.token,
        enabled: item.enabled,
        remark: item.remark || '',
        expires_at: item.expires_at || null,
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
export async function saveConfigToDB(env, apiUrl, token, enabled, remark = '', expiresAt = null) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/api_configs`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        api_url: apiUrl,
        token: token,
        enabled: enabled,
        remark: remark || null,
        expires_at: expiresAt || null,
      }),
    })

    if (!response.ok) {
      return { success: false, error: await response.text() }
    }

    await clearAllCache(env)
    return { success: true, data: await response.json() }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 更新配置
 */
export async function updateConfigInDB(env, id, updates) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    // 添加更新时间
    const data = { ...updates, updated_at: new Date().toISOString() }

    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    )

    if (!response.ok) {
      return { success: false, error: await response.text() }
    }

    await clearAllCache(env)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 软删除配置（设置 deleted_at 而非物理删除）
 */
export async function deleteConfigFromDB(env, id) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deleted_at: new Date().toISOString(),
        }),
      }
    )

    if (!response.ok) {
      return { success: false, error: await response.text() }
    }

    await clearAllCache(env)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 生成 SK 别名
 * 格式: sk-ar-[32位随机字符]
 * 类似 OpenAI 的 sk-xxx 格式
 */
export function generateSkAlias() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = 'sk-ar-'
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 更新配置的 SK 别名
 * @param {object} env - 环境变量
 * @param {number} id - 配置 ID
 * @param {string|null} skAlias - SK 别名（null 表示生成新的）
 */
export async function updateSkAlias(env, id, skAlias = null) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { success: false, error: 'Database not configured' }
  }

  const newAlias = skAlias || generateSkAlias()

  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          sk_alias: newAlias,
          updated_at: new Date().toISOString(),
        }),
      }
    )

    if (!response.ok) {
      return { success: false, error: await response.text() }
    }

    await clearAllCache(env)
    return { success: true, sk_alias: newAlias }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 通过 SK 别名查找配置
 * @param {object} config - 配置对象
 * @param {string} skAlias - SK 别名
 * @returns {{ apiUrl: string, key: object } | null}
 */
export function findBySkAlias(config, skAlias) {
  for (const [apiUrl, apiConfig] of Object.entries(config)) {
    if (!apiConfig.keys) continue
    const key = apiConfig.keys.find(k => k.sk_alias === skAlias)
    if (key) {
      return { apiUrl, key }
    }
  }
  return null
}

/**
 * 从指定 URL 的配置中随机选择一个启用的 key
 */
export function getRandomEnabledKey(config, apiUrl) {
  const apiConfig = config[apiUrl]
  if (!apiConfig || !apiConfig.keys) {
    return null
  }

  // 过滤出所有启用的 keys
  const enabledKeys = apiConfig.keys.filter((key) => key.enabled)

  if (enabledKeys.length === 0) {
    return null
  }

  // 随机选择一个启用的 key
  const randomIndex = Math.floor(Math.random() * enabledKeys.length)
  return enabledKeys[randomIndex].token
}
