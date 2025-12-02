// ============ 状态页面 HTML ============

import { BUILD_TIME } from '../config.js'

/**
 * 生成状态页面 HTML
 */
export function getStatusHtml() {
  const buildTimeFormatted = new Date(BUILD_TIME)
    .toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

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
      <a href="/docs" class="btn btn-primary"><i class="fas fa-book"></i>使用文档</a>
      <a href="/admin" class="btn btn-secondary"><i class="fas fa-cog"></i>管理面板</a>
      <a href="https://github.com/dext7r/anyrouter" target="_blank" class="btn btn-secondary"><i class="fab fa-github"></i>GitHub</a>
    </div>
  </div>
  <div class="footer">
    <div>Powered by <a href="https://workers.cloudflare.com" target="_blank">Cloudflare Workers</a></div>
    <div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">
      <i class="fas fa-clock"></i> 部署时间: ${buildTimeFormatted}
    </div>
  </div>
</body>
</html>`
}
