// ============ 代理请求处理 ============

import { jsonResponse } from '../utils/helpers.js'
import { getConfigFromDB, findBySkAlias } from '../db/supabase.js'
import { recordRequest, isIpBlocked } from '../cache/stats.js'

/**
 * 生成友好的错误响应
 */
function errorResponse(code, message, hint) {
  return jsonResponse({
    error: {
      code,
      message,
      hint,
      contact: '如有疑问请联系管理员',
    }
  }, code === 'UNAUTHORIZED' ? 401 :
    code === 'BAD_REQUEST' ? 400 :
      code === 'NOT_FOUND' ? 404 :
        code === 'FORBIDDEN' ? 403 :
          code === 'SERVICE_ERROR' ? 503 : 500)
}

/**
 * 处理代理请求
 * 支持两种格式:
 * 1. Authorization: Bearer https://api.example.com:123 (按 ID 查找 token)
 * 2. Authorization: Bearer https://api.example.com:sk-xxx (直接使用 token)
 * @param {Request} request
 * @param {object} env
 * @param {URL} url
 * @param {ExecutionContext} ctx - Cloudflare Workers 执行上下文，用于 waitUntil
 */
export async function handleProxyRequest(request, env, url, ctx) {
  // 获取客户端 IP
  const clientIp = request.headers.get('CF-Connecting-IP') ||
                   request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
                   'unknown'

  // 检查 IP 黑名单
  const blockCheck = await isIpBlocked(env, clientIp)
  if (blockCheck.blocked) {
    return jsonResponse({
      error: {
        code: 'IP_BLOCKED',
        message: 'IP 已被封禁',
        reason: blockCheck.reason,
        ip: clientIp,
        contact: '如有疑问请联系管理员',
      }
    }, 403)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(
      'UNAUTHORIZED',
      '缺少授权信息',
      '请在 Authorization header 中提供 Bearer token，格式: Bearer <API_URL>:<Key ID> 或 Bearer sk-ar-xxx'
    )
  }

  const authValue = authHeader.substring(7).trim() // 去掉 "Bearer " 前缀

  // 获取配置
  const config = await getConfigFromDB(env)

  let tokenToUse
  let targetApiUrl
  let usedKeyId = null

  // 检查是否是 SK 别名模式 (sk-ar-xxx)
  if (authValue.startsWith('sk-ar-')) {
    const found = findBySkAlias(config, authValue)
    if (!found) {
      return errorResponse(
        'NOT_FOUND',
        'SK 别名不存在',
        `找不到 SK 别名 "${authValue}"，请检查是否输入正确或联系管理员获取有效的 SK`
      )
    }

    if (!found.key.enabled) {
      return errorResponse(
        'FORBIDDEN',
        'SK 已被禁用',
        '此 SK 别名当前处于禁用状态，请联系管理员启用'
      )
    }

    // 检查是否过期
    if (found.key.expires_at && new Date(found.key.expires_at) < new Date()) {
      return errorResponse(
        'FORBIDDEN',
        'SK 已过期',
        `此 SK 别名已于 ${found.key.expires_at} 过期，请联系管理员续期或获取新的 SK`
      )
    }

    tokenToUse = found.key.token
    targetApiUrl = found.apiUrl
    usedKeyId = found.key.key_id
  } else {
    // 原有格式: <api_url>:<key>
    // 需要从最后一个冒号分割，因为 URL 中可能包含端口号 (https://api.example.com:8080:key)
    const lastColonIndex = authValue.lastIndexOf(':')
    if (lastColonIndex === -1 || lastColonIndex < 8) {
      // 没有冒号，或者冒号在 https:// 中
      return errorResponse(
        'BAD_REQUEST',
        '授权格式错误',
        '正确格式: <API_URL>:<Key ID> 或 sk-ar-xxx，例如 https://api.openai.com:a3x9k2'
      )
    }

    targetApiUrl = authValue.substring(0, lastColonIndex)
    const keyPart = authValue.substring(lastColonIndex + 1)

    // 验证 API URL 格式
    if (!targetApiUrl.startsWith('http://') && !targetApiUrl.startsWith('https://')) {
      return errorResponse(
        'BAD_REQUEST',
        'API URL 格式无效',
        'URL 必须以 http:// 或 https:// 开头'
      )
    }

    if (!keyPart) {
      return errorResponse(
        'BAD_REQUEST',
        '缺少 Key ID 或 Token',
        '请在 URL 后面加上冒号和 Key ID（6位）或完整 Token'
      )
    }

    // 判断是 key_id (6位字母数字) 还是直接 token
    const isKeyId = /^[a-z0-9]{6}$/.test(keyPart)

    if (isKeyId) {
      // 按 key_id 查找 token
      const keyId = keyPart
      usedKeyId = keyId

      // 检查该 API URL 是否在配置中
      if (!config[targetApiUrl]) {
        return errorResponse(
          'NOT_FOUND',
          'API 地址未配置',
          `目标 API "${targetApiUrl}" 尚未在系统中注册，请联系管理员添加配置`
        )
      }

      // 在该 URL 的 keys 中查找指定 key_id
      const keyConfig = config[targetApiUrl].keys.find(k => k.key_id === keyId)
      if (!keyConfig) {
        return errorResponse(
          'NOT_FOUND',
          'Key ID 不存在',
          `找不到 Key ID "${keyId}"，请检查是否输入正确或联系管理员获取有效的 Key ID`
        )
      }

      if (!keyConfig.enabled) {
        return errorResponse(
          'FORBIDDEN',
          'Key 已被禁用',
          `Key ID "${keyId}" 当前处于禁用状态，请联系管理员启用或获取新的 Key ID`
        )
      }

      // 检查是否过期
      if (keyConfig.expires_at && new Date(keyConfig.expires_at) < new Date()) {
        return errorResponse(
          'FORBIDDEN',
          'Key 已过期',
          `Key ID "${keyId}" 已于 ${keyConfig.expires_at} 过期，请联系管理员续期或获取新的 Key ID`
        )
      }

      tokenToUse = keyConfig.token
    } else {
      // 直接使用传入的 token
      tokenToUse = keyPart
    }
  }

  // 设置目标主机和协议
  const targetUrl = new URL(targetApiUrl)

  // 检查是否在尝试反代自身（禁止循环代理）
  const selfHostname = url.hostname.toLowerCase()
  const targetHostname = targetUrl.hostname.toLowerCase()
  if (targetHostname === selfHostname ||
      targetHostname.endsWith('.' + selfHostname) ||
      selfHostname.endsWith('.' + targetHostname)) {
    return errorResponse(
      'FORBIDDEN',
      '禁止反代自身',
      '不允许将请求代理到代理服务自身的域名，这会造成循环请求'
    )
  }

  url.protocol = targetUrl.protocol
  url.hostname = targetUrl.hostname
  url.port = targetUrl.port || ''

  // 获取原始请求头
  const headers = new Headers(request.headers)

  // 设置 Authorization header
  headers.set('authorization', 'Bearer ' + tokenToUse)

  const modifiedRequest = new Request(url.toString(), {
    headers: headers,
    method: request.method,
    body: request.body,
    redirect: 'follow',
  })

  try {
    const response = await fetch(modifiedRequest)
    const modifiedResponse = new Response(response.body, response)

    // 添加允许跨域访问的响应头
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*')

    // 记录请求统计（使用 waitUntil 确保在响应后完成）
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(recordRequest(env, {
        apiUrl: targetApiUrl,
        keyId: usedKeyId,
        success: response.ok,
        ip: clientIp,
      }))
    }

    return modifiedResponse
  } catch (error) {
    // 记录失败请求
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(recordRequest(env, {
        apiUrl: targetApiUrl,
        keyId: usedKeyId,
        success: false,
        ip: clientIp,
      }))
    }

    console.error('Proxy request error:', error)
    return errorResponse(
      'SERVICE_ERROR',
      '代理请求失败',
      `无法连接到目标 API "${targetApiUrl}"，可能是网络问题或目标服务不可用，请稍后重试`
    )
  }
}
