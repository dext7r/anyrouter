// ============ 缓存管理 ============

import { CONFIG_CACHE_TTL_MS, CACHE_KEY } from '../config.js'
import { getRedisClient } from './redis.js'

// 内存缓存
let configCache = { value: null, expiresAt: 0 }

/**
 * 获取内存缓存的配置
 * @returns {Record<string, any>|null} 缓存的配置或 null（已过期）
 */
export function getCachedConfig() {
  if (configCache.value && configCache.expiresAt > Date.now()) {
    return configCache.value
  }
  return null
}

/**
 * 写入内存缓存
 * @param {Record<string, any>} config 配置对象
 */
export function setConfigCache(config) {
  configCache = {
    value: config,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  }
}

/**
 * 使内存缓存失效
 */
export function invalidateConfigCache() {
  configCache = { value: null, expiresAt: 0 }
}

/**
 * 使所有缓存失效（内存 + Redis + KV）
 * @param {object} env - 环境变量
 */
export async function invalidateAllCache(env) {
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

/**
 * 预热缓存：强制从数据库加载并写入所有缓存层
 * @param {object} env - 环境变量
 * @returns {Promise<{success: boolean, cached: string[], error?: string}>}
 */
export async function warmupCache(env) {
  const result = { success: false, cached: [], keysCount: 0 }

  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return { ...result, error: 'Database not configured' }
  }

  try {
    // 1. 从数据库获取最新数据
    let response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/api_configs?select=*&deleted_at=is.null&order=created_at.desc`,
      {
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
        },
      }
    )

    if (!response.ok) {
      response = await fetch(
        `${env.SUPABASE_URL}/rest/v1/api_configs?select=*&order=created_at.desc`,
        {
          headers: {
            apikey: env.SUPABASE_KEY,
            Authorization: `Bearer ${env.SUPABASE_KEY}`,
          },
        }
      )
    }

    if (!response.ok) {
      return { ...result, error: `Database query failed: HTTP ${response.status}` }
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

    result.keysCount = data.length

    // 2. 写入内存缓存
    setConfigCache(config)
    result.cached.push('memory')

    // 3. 写入 Redis 缓存
    const redis = getRedisClient(env)
    if (redis) {
      try {
        const { REDIS_CACHE_TTL_SECONDS } = await import('../config.js')
        await redis.set(CACHE_KEY, JSON.stringify(config), REDIS_CACHE_TTL_SECONDS)
        result.cached.push('redis')
      } catch (e) {
        result.redisError = e.message
      }
    }

    // 4. 写入 KV 缓存
    if (env.CONFIG_KV) {
      try {
        const { KV_CACHE_TTL_SECONDS } = await import('../config.js')
        await env.CONFIG_KV.put(CACHE_KEY, JSON.stringify(config), {
          expirationTtl: KV_CACHE_TTL_SECONDS,
        })
        result.cached.push('kv')
      } catch (e) {
        result.kvError = e.message
      }
    }

    result.success = true
    return result
  } catch (error) {
    return { ...result, error: error.message }
  }
}
