// ============ 工具函数 ============

import { DEFAULT_ADMIN_PASSWORD } from '../config.js'

/**
 * 获取管理员密码（优先使用环境变量，否则使用默认值）
 */
export function getAdminPassword(env) {
  return env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
}

/**
 * 验证管理员密码
 */
export function verifyAdmin(request, env) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.substring(7).trim()
  return token === getAdminPassword(env).trim()
}

/**
 * 校验 URL 是否有效
 * @param {string} apiUrl
 * @returns {boolean}
 */
export function isValidUrl(apiUrl) {
  if (typeof apiUrl !== 'string' || apiUrl.length === 0) {
    return false
  }

  try {
    const parsed = new URL(apiUrl)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 校验 token 是否符合要求
 * @param {string} token
 * @returns {boolean}
 */
export function isValidToken(token) {
  // 允许字母、数字、常见特殊字符（_-./=+ 等），排除空格和危险字符
  return (
    typeof token === 'string' &&
    token.length > 0 &&
    token.length <= 1000 &&
    !/[\s\0\n\r]/.test(token)
  )
}

/**
 * 校验配置请求体
 * @param {any} body
 * @param {{ partial?: boolean }} [options]
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateConfigPayload(body, options = {}) {
  const { partial = false } = options

  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid payload' }
  }

  if (!partial || 'api_url' in body) {
    if (!isValidUrl(body.api_url)) {
      return { valid: false, error: 'api_url is required and must be a valid URL' }
    }
  }

  if (!partial || 'token' in body) {
    if (!isValidToken(body.token)) {
      return { valid: false, error: 'token is required and must not contain special characters' }
    }
  }

  if ('enabled' in body && typeof body.enabled !== 'boolean') {
    return { valid: false, error: 'enabled must be a boolean' }
  }

  if ('remark' in body) {
    if (body.remark !== null && typeof body.remark !== 'string') {
      return { valid: false, error: 'remark must be a string or null' }
    }
    if (body.remark && body.remark.length > 255) {
      return { valid: false, error: 'remark must be 255 characters or less' }
    }
  }

  if (partial && !('api_url' in body || 'token' in body || 'enabled' in body || 'remark' in body)) {
    return { valid: false, error: 'No fields provided for update' }
  }

  return { valid: true }
}

/**
 * 判断配置中是否存在启用的 key
 * @param {Record<string, any>} config
 * @param {string} [apiUrl]
 * @returns {boolean}
 */
export function hasEnabledKey(config, apiUrl) {
  if (!config || Object.keys(config).length === 0) {
    return false
  }

  if (apiUrl) {
    const apiConfig = config[apiUrl]
    return Boolean(apiConfig && apiConfig.keys && apiConfig.keys.some((key) => key.enabled))
  }

  return Object.values(config).some(
    (item) => item.keys && item.keys.some((key) => key.enabled)
  )
}

/**
 * 返回 JSON 响应
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

/**
 * 处理 CORS
 */
export function handleCORS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
