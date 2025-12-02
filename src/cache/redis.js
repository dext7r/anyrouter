// ============ Upstash Redis REST API 客户端 ============

/**
 * Upstash Redis REST API 客户端
 * 使用 HTTP REST API，无需 TCP 连接，适合 Serverless
 */
export class RedisClient {
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
export function getRedisClient(env) {
  if (!env.UPSTASH_REDIS_URL || !env.UPSTASH_REDIS_TOKEN) {
    return null
  }
  return new RedisClient(env.UPSTASH_REDIS_URL, env.UPSTASH_REDIS_TOKEN)
}
