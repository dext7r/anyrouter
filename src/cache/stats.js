// ============ Redis 请求统计 & IP 黑名单 ============

import { getRedisClient } from './redis.js'

// 统计 Key 前缀
const STATS_PREFIX = 'anyrouter:stats'
const BLACKLIST_KEY = 'anyrouter:blacklist:ips'

/**
 * 获取今日日期字符串 (YYYY-MM-DD)
 */
function getTodayKey() {
  return new Date().toISOString().split('T')[0]
}

/**
 * 获取当前小时字符串 (YYYY-MM-DD-HH)
 */
function getHourKey() {
  const now = new Date()
  return `${now.toISOString().split('T')[0]}-${now.getUTCHours().toString().padStart(2, '0')}`
}

/**
 * 记录请求统计（异步，不阻塞响应）
 * @param {object} env - 环境变量
 * @param {object} data - 请求数据 { apiUrl, keyId, success, ip }
 */
export async function recordRequest(env, data) {
  const redis = getRedisClient(env)
  if (!redis) return

  const { apiUrl, keyId, success, ip } = data
  const today = getTodayKey()
  const hour = getHourKey()

  try {
    // 使用 Redis Pipeline 批量执行（Upstash REST API 支持）
    const commands = [
      // 总请求数（今日）
      ['INCR', `${STATS_PREFIX}:daily:${today}:total`],
      // 成功/失败计数
      ['INCR', `${STATS_PREFIX}:daily:${today}:${success ? 'success' : 'error'}`],
      // 每小时请求数
      ['INCR', `${STATS_PREFIX}:hourly:${hour}:total`],
      // 每个 API URL 的请求数
      ['HINCRBY', `${STATS_PREFIX}:daily:${today}:urls`, apiUrl, 1],
    ]

    // 如果有 keyId，记录 key 使用次数和最后请求时间
    if (keyId) {
      commands.push(['HINCRBY', `${STATS_PREFIX}:daily:${today}:keys`, keyId, 1])
      // 记录最后请求时间（永久保存，不设置过期）
      commands.push(['HSET', `${STATS_PREFIX}:lastused`, keyId, new Date().toISOString()])
    }

    // 记录 IP 使用次数（今日）
    if (ip && ip !== 'unknown') {
      commands.push(['HINCRBY', `${STATS_PREFIX}:daily:${today}:ips`, ip, 1])
    }

    // 设置过期时间（7天）
    const ttl = 7 * 24 * 60 * 60
    commands.push(
      ['EXPIRE', `${STATS_PREFIX}:daily:${today}:total`, ttl],
      ['EXPIRE', `${STATS_PREFIX}:daily:${today}:success`, ttl],
      ['EXPIRE', `${STATS_PREFIX}:daily:${today}:error`, ttl],
      ['EXPIRE', `${STATS_PREFIX}:hourly:${hour}:total`, ttl],
      ['EXPIRE', `${STATS_PREFIX}:daily:${today}:urls`, ttl],
      ['EXPIRE', `${STATS_PREFIX}:daily:${today}:keys`, ttl],
      ['EXPIRE', `${STATS_PREFIX}:daily:${today}:ips`, ttl],
    )

    // 逐个执行命令（Upstash REST API 不支持真正的 pipeline）
    for (const cmd of commands) {
      await redis.request(cmd)
    }
  } catch {
    // 统计失败不影响主流程
  }
}

/**
 * 获取统计数据
 * @param {object} env - 环境变量
 * @param {number} days - 查询天数（默认7天）
 */
export async function getStats(env, days = 7) {
  const redis = getRedisClient(env)
  if (!redis) {
    return { enabled: false, message: 'Redis not configured' }
  }

  try {
    const stats = {
      enabled: true,
      daily: [],
      hourly: [],
      topUrls: {},
      topKeys: {},
      topIps: {},
      summary: { total: 0, success: 0, error: 0 },
    }

    // 获取最近 N 天的数据
    const dates = []
    for (let i = 0; i < days; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      dates.push(d.toISOString().split('T')[0])
    }

    // 查询每日数据
    for (const date of dates) {
      const total = await redis.get(`${STATS_PREFIX}:daily:${date}:total`) || 0
      const success = await redis.get(`${STATS_PREFIX}:daily:${date}:success`) || 0
      const error = await redis.get(`${STATS_PREFIX}:daily:${date}:error`) || 0

      stats.daily.push({
        date,
        total: parseInt(total),
        success: parseInt(success),
        error: parseInt(error),
      })

      stats.summary.total += parseInt(total)
      stats.summary.success += parseInt(success)
      stats.summary.error += parseInt(error)
    }

    // 获取今日 URL 使用排行
    const today = getTodayKey()
    const urlStats = await redis.request(['HGETALL', `${STATS_PREFIX}:daily:${today}:urls`])
    if (urlStats && Array.isArray(urlStats)) {
      for (let i = 0; i < urlStats.length; i += 2) {
        stats.topUrls[urlStats[i]] = parseInt(urlStats[i + 1])
      }
    }

    // 获取今日 Key 使用排行
    const keyStats = await redis.request(['HGETALL', `${STATS_PREFIX}:daily:${today}:keys`])
    if (keyStats && Array.isArray(keyStats)) {
      for (let i = 0; i < keyStats.length; i += 2) {
        stats.topKeys[keyStats[i]] = parseInt(keyStats[i + 1])
      }
    }

    // 获取今日 IP 使用排行
    const ipStats = await redis.request(['HGETALL', `${STATS_PREFIX}:daily:${today}:ips`])
    if (ipStats && Array.isArray(ipStats)) {
      for (let i = 0; i < ipStats.length; i += 2) {
        stats.topIps[ipStats[i]] = parseInt(ipStats[i + 1])
      }
    }

    // 获取最近24小时数据
    for (let i = 0; i < 24; i++) {
      const d = new Date()
      d.setHours(d.getHours() - i)
      const hourKey = `${d.toISOString().split('T')[0]}-${d.getUTCHours().toString().padStart(2, '0')}`
      const hourTotal = await redis.get(`${STATS_PREFIX}:hourly:${hourKey}:total`) || 0
      stats.hourly.push({
        hour: hourKey,
        total: parseInt(hourTotal),
      })
    }

    stats.daily.reverse() // 按时间正序
    stats.hourly.reverse()

    return stats
  } catch (error) {
    return { enabled: false, error: error.message }
  }
}

/**
 * 获取所有 key 的最后使用时间
 * @param {object} env - 环境变量
 * @returns {Promise<Record<string, string>>} keyId -> ISO时间字符串
 */
export async function getLastUsedTimes(env) {
  const redis = getRedisClient(env)
  if (!redis) return {}

  try {
    const result = await redis.request(['HGETALL', `${STATS_PREFIX}:lastused`])
    if (!result || !Array.isArray(result)) return {}

    const lastUsed = {}
    for (let i = 0; i < result.length; i += 2) {
      lastUsed[result[i]] = result[i + 1]
    }
    return lastUsed
  } catch {
    return {}
  }
}

/**
 * 记录管理员登录
 * @param {object} env - 环境变量
 * @param {Request} request - 请求对象（用于获取 IP）
 */
export async function recordLogin(env, request) {
  const redis = getRedisClient(env)
  if (!redis) return

  try {
    // 获取客户端 IP（Cloudflare 提供）
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
               'unknown'

    const userAgent = request.headers.get('User-Agent') || 'unknown'
    const now = new Date().toISOString()

    // 登录记录格式：时间|IP|UA
    const record = JSON.stringify({ time: now, ip, ua: userAgent })

    // 使用 LPUSH 添加到列表头部，最多保留 50 条记录
    await redis.request(['LPUSH', `${STATS_PREFIX}:logins`, record])
    await redis.request(['LTRIM', `${STATS_PREFIX}:logins`, 0, 49])
  } catch {
    // 记录失败不影响登录
  }
}

/**
 * 获取登录记录
 * @param {object} env - 环境变量
 * @param {number} limit - 获取记录数量（默认20条）
 */
export async function getLoginRecords(env, limit = 20) {
  const redis = getRedisClient(env)
  if (!redis) return []

  try {
    const records = await redis.request(['LRANGE', `${STATS_PREFIX}:logins`, 0, limit - 1])
    if (!records || !Array.isArray(records)) return []

    return records.map(r => {
      try {
        return JSON.parse(r)
      } catch {
        return null
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}

// ============ IP 黑名单管理 ============

/**
 * 检查 IP 是否在黑名单中
 * @param {object} env - 环境变量
 * @param {string} ip - IP 地址
 * @returns {Promise<{blocked: boolean, reason?: string}>}
 */
export async function isIpBlocked(env, ip) {
  const redis = getRedisClient(env)
  if (!redis || !ip || ip === 'unknown') return { blocked: false }

  try {
    const reason = await redis.request(['HGET', BLACKLIST_KEY, ip])
    if (reason) {
      return { blocked: true, reason: reason || '已被管理员封禁' }
    }
    return { blocked: false }
  } catch {
    return { blocked: false }
  }
}

/**
 * 添加 IP 到黑名单
 * @param {object} env - 环境变量
 * @param {string} ip - IP 地址
 * @param {string} reason - 封禁原因
 */
export async function blockIp(env, ip, reason = '手动封禁') {
  const redis = getRedisClient(env)
  if (!redis) return { success: false, error: 'Redis not configured' }

  try {
    const record = JSON.stringify({
      reason,
      blocked_at: new Date().toISOString(),
    })
    await redis.request(['HSET', BLACKLIST_KEY, ip, record])
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 从黑名单移除 IP
 * @param {object} env - 环境变量
 * @param {string} ip - IP 地址
 */
export async function unblockIp(env, ip) {
  const redis = getRedisClient(env)
  if (!redis) return { success: false, error: 'Redis not configured' }

  try {
    await redis.request(['HDEL', BLACKLIST_KEY, ip])
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 获取黑名单列表
 * @param {object} env - 环境变量
 */
export async function getBlockedIps(env) {
  const redis = getRedisClient(env)
  if (!redis) return []

  try {
    const result = await redis.request(['HGETALL', BLACKLIST_KEY])
    if (!result || !Array.isArray(result)) return []

    const blockedIps = []
    for (let i = 0; i < result.length; i += 2) {
      const ip = result[i]
      let info = { reason: '手动封禁', blocked_at: null }
      try {
        info = JSON.parse(result[i + 1])
      } catch {
        info.reason = result[i + 1] || '手动封禁'
      }
      blockedIps.push({ ip, ...info })
    }
    return blockedIps
  } catch {
    return []
  }
}
