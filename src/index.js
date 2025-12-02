// ============ AnyRouter 主入口 ============

import { handleCORS } from './utils/helpers.js'
import { handleApiRequest } from './handlers/api.js'
import { handleProxyRequest } from './handlers/proxy.js'
import { getStatusHtml } from './pages/status.js'
import { getAdminHtml } from './pages/admin.js'
import { getDocsHtml } from './pages/docs.js'

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx)
  },
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url)

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return handleCORS()
  }

  // 管理页面路由
  if (url.pathname === '/admin') {
    return new Response(getAdminHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // 公开文档页面（无需鉴权）
  if (url.pathname === '/docs') {
    return new Response(getDocsHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // API 路由
  if (url.pathname.startsWith('/api/')) {
    return handleApiRequest(request, env, url)
  }

  // 根路径返回状态页面
  if (request.method === 'GET' && url.pathname === '/') {
    return new Response(getStatusHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // 代理请求处理（传递 ctx 用于 waitUntil）
  return handleProxyRequest(request, env, url, ctx)
}
