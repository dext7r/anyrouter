// ============ 公开文档页面 ============

/**
 * 生成文档页面 HTML（无需鉴权）
 */
export function getDocsHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AnyRouter - 通用 API 代理服务文档</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
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
    /* TOC 左右收起动画 */
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
          <p class="text-xl text-purple-100 mb-2">通用 API 代理服务</p>
          <p class="text-purple-200 mb-6">支持 OpenAI、Anthropic、Google、Azure、Groq 等任意 HTTP API 的统一转发</p>
          <div class="flex gap-3 flex-wrap">
            <a href="https://github.com/dext7r/anyrouter" target="_blank" class="inline-flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all">
              <i class="fab fa-github mr-2"></i>GitHub
            </a>
            <a href="/admin" class="inline-flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all">
              <i class="fas fa-cog mr-2"></i>管理面板
            </a>
            <a href="/" class="inline-flex items-center px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all">
              <i class="fas fa-home mr-2"></i>首页
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
            <h3 class="font-bold text-gray-800 toc-content whitespace-nowrap"><i class="fas fa-list mr-2 text-purple-600"></i>目录</h3>
            <i class="fas fa-chevron-left text-purple-600 toc-toggle-btn"></i>
          </div>
          <ul class="space-y-2 text-sm text-gray-600 px-4 pb-4 toc-content">
            <li><a href="#overview" class="toc-link block py-1">概述</a></li>
            <li><a href="#supported-apis" class="toc-link block py-1">支持的 API</a></li>
            <li><a href="#quick-start" class="toc-link block py-1">快速开始</a></li>
            <li><a href="#auth-format" class="toc-link block py-1">认证格式</a></li>
            <li><a href="#usage-modes" class="toc-link block py-1">使用模式</a></li>
            <li><a href="#examples" class="toc-link block py-1">代码示例</a></li>
            <li><a href="#sdk-config" class="toc-link block py-1">SDK 配置</a></li>
            <li><a href="#errors" class="toc-link block py-1">错误处理</a></li>
            <li><a href="#deployment" class="toc-link block py-1">部署指南</a></li>
            <li><a href="#faq" class="toc-link block py-1">常见问题</a></li>
          </ul>
        </nav>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 min-w-0">
        <!-- Overview -->
        <section id="overview" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-info-circle mr-2 text-purple-600"></i>概述</h2>
          <p class="text-gray-600 mb-4">AnyRouter 是一个运行在 Cloudflare Workers 上的<strong>通用 API 代理服务</strong>，可以转发任意 HTTP API 请求：</p>
          <ul class="space-y-2 text-gray-600">
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>通用代理</strong>：支持任意 HTTP/HTTPS API，不限于 AI 服务</li>
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>密钥管理</strong>：统一管理多个 API 密钥，通过短 ID 安全访问</li>
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>直传模式</strong>：无需预先配置，直接传递 Token 即可使用</li>
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>边缘加速</strong>：基于 Cloudflare 全球边缘网络，低延迟访问</li>
            <li class="flex items-start"><i class="fas fa-check text-green-500 mt-1 mr-2"></i><strong>请求统计</strong>：记录使用量，支持按 API 和 Key 统计</li>
          </ul>
        </section>

        <!-- Supported APIs -->
        <section id="supported-apis" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-plug mr-2 text-purple-600"></i>支持的 API</h2>
          <p class="text-gray-600 mb-4">AnyRouter 支持任意 HTTP API，以下是常用的 AI 服务示例：</p>

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
                <span class="font-semibold text-gray-800 text-sm">更多...</span>
              </div>
              <code class="text-xs text-gray-600">任意 HTTP API</code>
            </div>
          </div>

          <div class="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p class="text-sm text-blue-700"><i class="fas fa-info-circle mr-1"></i>只要是标准的 HTTP/HTTPS API，都可以通过 AnyRouter 代理访问，不限于上述服务。</p>
          </div>
        </section>

        <!-- Quick Start -->
        <section id="quick-start" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-bolt mr-2 text-purple-600"></i>快速开始</h2>
          <div class="space-y-4">
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">1. 获取代理地址</h3>
              <p class="text-gray-600 mb-2">当前服务地址：</p>
              <div class="code-block relative">
                <pre><code class="language-text" id="proxyUrl"></code></pre>
                <button onclick="copyToClipboard('proxyUrl')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            </div>
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">2. 设置认证信息</h3>
              <p class="text-gray-600">在请求头中添加 <code class="bg-gray-100 px-2 py-1 rounded text-purple-600">Authorization</code> 字段，格式如下：</p>
            </div>
          </div>
        </section>

        <!-- Auth Format -->
        <section id="auth-format" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-key mr-2 text-purple-600"></i>认证格式</h2>
          <div class="code-block relative mb-4">
            <pre><code class="language-http">Authorization: Bearer &lt;目标API地址&gt;:&lt;Key ID 或 Token&gt;</code></pre>
          </div>
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h4 class="font-semibold text-yellow-800 mb-2"><i class="fas fa-lightbulb mr-1"></i>格式说明</h4>
            <ul class="text-sm text-yellow-700 space-y-1">
              <li>• <strong>目标API地址</strong>：完整的 API 地址，如 <code>https://api.openai.com</code></li>
              <li>• <strong>Key ID</strong>：6 位字母数字组合，用于从数据库查找对应的 Token</li>
              <li>• <strong>Token</strong>：直接传递完整的 API Token（直传模式）</li>
            </ul>
          </div>

          <h3 class="font-semibold text-gray-800 mb-2">各平台示例</h3>
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
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-exchange-alt mr-2 text-purple-600"></i>使用模式</h2>

          <div class="grid md:grid-cols-3 gap-4">
            <!-- SK Alias Mode -->
            <div class="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-4 border-2 border-orange-300">
              <div class="flex items-center mb-3">
                <span class="px-2 py-1 bg-orange-500 text-white text-xs rounded-full font-bold mr-2">最佳</span>
                <h3 class="font-bold text-orange-800">SK 别名模式</h3>
              </div>
              <p class="text-sm text-orange-700 mb-3">使用类似 OpenAI 格式的 SK 别名，一键访问</p>
              <div class="code-block">
                <pre><code class="language-text">Bearer sk-ar-xxxxxxxx...</code></pre>
              </div>
              <ul class="mt-3 text-xs text-orange-600 space-y-1">
                <li><i class="fas fa-star mr-1"></i>类似原生 API Key 格式</li>
                <li><i class="fas fa-shield-alt mr-1"></i>不暴露真实 Token</li>
                <li><i class="fas fa-magic mr-1"></i>自动识别目标 API</li>
                <li><i class="fas fa-sync mr-1"></i>可随时重新生成</li>
              </ul>
            </div>

            <!-- Key ID Mode -->
            <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
              <div class="flex items-center mb-3">
                <span class="px-2 py-1 bg-blue-500 text-white text-xs rounded-full font-bold mr-2">推荐</span>
                <h3 class="font-bold text-blue-800">Key ID 模式</h3>
              </div>
              <p class="text-sm text-blue-700 mb-3">使用 6 位短 ID + URL 访问预配置的密钥</p>
              <div class="code-block">
                <pre><code class="language-text">Bearer https://api.openai.com:a3x9k2</code></pre>
              </div>
              <ul class="mt-3 text-xs text-blue-600 space-y-1">
                <li><i class="fas fa-shield-alt mr-1"></i>不暴露真实 Token</li>
                <li><i class="fas fa-tachometer-alt mr-1"></i>支持使用统计</li>
                <li><i class="fas fa-toggle-on mr-1"></i>可随时启用/禁用</li>
              </ul>
            </div>

            <!-- Direct Mode -->
            <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
              <div class="flex items-center mb-3">
                <span class="px-2 py-1 bg-green-500 text-white text-xs rounded-full font-bold mr-2">灵活</span>
                <h3 class="font-bold text-green-800">直传模式</h3>
              </div>
              <p class="text-sm text-green-700 mb-3">直接在请求中传递 API Token</p>
              <div class="code-block">
                <pre><code class="language-text">Bearer https://api.openai.com:sk-xxx...</code></pre>
              </div>
              <ul class="mt-3 text-xs text-green-600 space-y-1">
                <li><i class="fas fa-bolt mr-1"></i>即用即走，无需配置</li>
                <li><i class="fas fa-globe mr-1"></i>支持任意 API 地址</li>
                <li><i class="fas fa-clock mr-1"></i>临时使用场景</li>
              </ul>
            </div>
          </div>

          <div class="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 class="font-semibold text-purple-800 mb-2"><i class="fas fa-magic mr-1"></i>模式自动判断</h4>
            <p class="text-sm text-purple-700">系统会根据 Authorization 内容自动判断模式：</p>
            <ul class="text-sm text-purple-600 mt-2 space-y-1">
              <li>• <code>sk-ar-xxx</code> 开头 → SK 别名模式（自动匹配目标 API）</li>
              <li>• URL 后跟 6 位字母数字（如 <code>https://...:a3x9k2</code>）→ Key ID 模式</li>
              <li>• URL 后跟其他格式（如 <code>https://...:sk-xxx</code>）→ 直传模式</li>
            </ul>
          </div>

          <!-- SK Alias Details -->
          <div class="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h4 class="font-semibold text-orange-800 mb-2"><i class="fas fa-key mr-1"></i>SK 别名详解</h4>
            <p class="text-sm text-orange-700 mb-3">SK 别名是 AnyRouter 独创的认证方式，格式类似各大平台的 API Key：</p>
            <div class="grid md:grid-cols-2 gap-3 text-sm">
              <div class="bg-white rounded p-3">
                <div class="font-medium text-gray-700 mb-1">格式对比</div>
                <ul class="text-xs text-gray-600 space-y-1">
                  <li>OpenAI: <code class="text-green-600">sk-proj-xxx</code></li>
                  <li>Anthropic: <code class="text-orange-600">sk-ant-xxx</code></li>
                  <li>AnyRouter: <code class="text-purple-600">sk-ar-xxx</code></li>
                </ul>
              </div>
              <div class="bg-white rounded p-3">
                <div class="font-medium text-gray-700 mb-1">使用方法</div>
                <ol class="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                  <li>在管理面板点击「生成」获取 SK 别名</li>
                  <li>直接用 <code>sk-ar-xxx</code> 作为 API Key</li>
                  <li>无需指定目标 API URL</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <!-- Code Examples -->
        <section id="examples" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-code mr-2 text-purple-600"></i>代码示例</h2>

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
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-cogs mr-2 text-purple-600"></i>SDK / CLI 配置</h2>
          <p class="text-gray-600 mb-4">通过环境变量配置各种 SDK 和 CLI 工具使用本代理服务：</p>

          <!-- SK Alias Mode (Recommended) -->
          <div class="mb-6 p-4 bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-300 rounded-lg">
            <h3 class="font-semibold text-orange-800 mb-2"><i class="fas fa-star mr-2 text-orange-500"></i>SK 别名模式（推荐）</h3>
            <p class="text-sm text-orange-700 mb-3">使用 SK 别名最简洁，无需指定目标 API URL：</p>
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
            <p class="text-xs text-orange-600"><i class="fas fa-info-circle mr-1"></i>在管理面板的配置列表中点击「生成」按钮获取你的 SK 别名</p>
          </div>

          <!-- Claude Code -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-orange-500"></i>Claude Code CLI（Key ID 模式）</h3>
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
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-green-500"></i>OpenAI CLI / SDK（Key ID 模式）</h3>
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
            <h3 class="font-semibold text-gray-800 mb-2"><i class="fas fa-terminal mr-2 text-purple-500"></i>通用配置模式</h3>
            <div class="code-block relative mb-2">
              <pre><code class="language-bash" id="config-generic"># SK 别名模式（最简洁）
export {SDK}_BASE_URL=<span class="proxy-url"></span>
export {SDK}_API_KEY=sk-ar-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Key ID 模式
export {SDK}_BASE_URL=<span class="proxy-url"></span>
export {SDK}_API_KEY=https://{目标API地址}:{KeyID}</code></pre>
              <button onclick="copyCode('config-generic')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 class="font-semibold text-blue-800 mb-2"><i class="fas fa-info-circle mr-1"></i>配置说明</h4>
            <ul class="text-sm text-blue-700 space-y-1">
              <li>• <strong>SK 别名模式</strong>：最简洁，只需一个 <code>sk-ar-xxx</code> 即可，系统自动识别目标 API</li>
              <li>• <strong>Key ID 模式</strong>：需要指定 URL 和 6 位 Key ID，适合需要明确指定目标的场景</li>
              <li>• 环境变量可以添加到 <code>~/.bashrc</code>、<code>~/.zshrc</code> 或项目的 <code>.env</code> 文件</li>
            </ul>
          </div>
        </section>

        <!-- Errors -->
        <section id="errors" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-exclamation-triangle mr-2 text-purple-600"></i>错误处理</h2>
          <p class="text-gray-600 mb-4">当请求出错时，API 会返回结构化的错误信息：</p>

          <div class="code-block mb-4">
            <pre><code class="language-json">{
  "error": {
    "code": "NOT_FOUND",
    "message": "Key ID 不存在",
    "hint": "找不到 Key ID \\"abc123\\"，请检查是否输入正确",
    "contact": "如有疑问请联系管理员"
  }
}</code></pre>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200">
                  <th class="text-left py-2 px-3 font-semibold text-gray-700">错误码</th>
                  <th class="text-left py-2 px-3 font-semibold text-gray-700">HTTP 状态</th>
                  <th class="text-left py-2 px-3 font-semibold text-gray-700">说明</th>
                </tr>
              </thead>
              <tbody class="text-gray-600">
                <tr class="border-b border-gray-100">
                  <td class="py-2 px-3"><code class="text-red-600">UNAUTHORIZED</code></td>
                  <td class="py-2 px-3">401</td>
                  <td class="py-2 px-3">缺少或无效的 Authorization header</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 px-3"><code class="text-red-600">BAD_REQUEST</code></td>
                  <td class="py-2 px-3">400</td>
                  <td class="py-2 px-3">请求格式错误</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 px-3"><code class="text-red-600">NOT_FOUND</code></td>
                  <td class="py-2 px-3">404</td>
                  <td class="py-2 px-3">API 地址未配置或 Key ID 不存在</td>
                </tr>
                <tr class="border-b border-gray-100">
                  <td class="py-2 px-3"><code class="text-red-600">FORBIDDEN</code></td>
                  <td class="py-2 px-3">403</td>
                  <td class="py-2 px-3">Key 已被禁用</td>
                </tr>
                <tr>
                  <td class="py-2 px-3"><code class="text-red-600">SERVICE_ERROR</code></td>
                  <td class="py-2 px-3">503</td>
                  <td class="py-2 px-3">无法连接到目标 API</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Deployment Guide -->
        <section id="deployment" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-server mr-2 text-purple-600"></i>部署指南</h2>
          <p class="text-gray-600 mb-4">选择以下任一方式部署你的 AnyRouter 代理服务：</p>

          <!-- Deploy Methods Tabs -->
          <div class="mb-6">
            <div class="flex border-b border-gray-200 mb-4">
              <button onclick="showDeployTab('oneclick')" id="tab-oneclick" class="deploy-tab px-4 py-2 text-sm font-medium text-purple-600 border-b-2 border-purple-600">
                <i class="fas fa-bolt mr-1"></i>一键部署
              </button>
              <button onclick="showDeployTab('github')" id="tab-github" class="deploy-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-600">
                <i class="fab fa-github mr-1"></i>GitHub 关联
              </button>
              <button onclick="showDeployTab('paste')" id="tab-paste" class="deploy-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-600">
                <i class="fas fa-paste mr-1"></i>复制粘贴
              </button>
              <button onclick="showDeployTab('cli')" id="tab-cli" class="deploy-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-600">
                <i class="fas fa-terminal mr-1"></i>命令行部署
              </button>
              <button onclick="showDeployTab('actions')" id="tab-actions" class="deploy-tab px-4 py-2 text-sm font-medium text-gray-500 hover:text-purple-600">
                <i class="fas fa-cogs mr-1"></i>GitHub Actions
              </button>
            </div>

            <!-- One-Click Deploy -->
            <div id="deploy-oneclick" class="deploy-content">
              <div class="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-orange-800 mb-2"><i class="fas fa-star mr-1"></i>最简单的方式</h4>
                <p class="text-sm text-orange-700 mb-3">点击下方按钮，自动 Fork 并部署到你的 Cloudflare 账户：</p>
                <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/dext7r/anyrouter" target="_blank" class="inline-block">
                  <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" class="h-10">
                </a>
              </div>
              <div class="text-sm text-gray-600">
                <p class="mb-2"><strong>部署后配置环境变量：</strong></p>
                <ol class="list-decimal list-inside space-y-1 text-gray-500">
                  <li>进入 Cloudflare Dashboard → Workers & Pages → 你的 Worker</li>
                  <li>点击 Settings → Variables and Secrets</li>
                  <li>添加 <code class="bg-gray-100 px-1 rounded">ADMIN_PASSWORD</code>、<code class="bg-gray-100 px-1 rounded">SUPABASE_URL</code> 等变量</li>
                </ol>
              </div>
            </div>

            <!-- GitHub Integration -->
            <div id="deploy-github" class="deploy-content hidden">
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-blue-800 mb-2"><i class="fab fa-github mr-1"></i>关联 GitHub 仓库自动部署</h4>
                <p class="text-sm text-blue-700">每次推送代码到 GitHub，Cloudflare 自动构建并部署</p>
              </div>
              <ol class="space-y-3 text-sm text-gray-600">
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">1.</span>
                  <div>Fork <a href="https://github.com/dext7r/anyrouter" target="_blank" class="text-purple-600 hover:underline">dext7r/anyrouter</a> 到你的 GitHub 账号</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">2.</span>
                  <div>登录 <a href="https://dash.cloudflare.com" target="_blank" class="text-purple-600 hover:underline">Cloudflare Dashboard</a> → Workers & Pages → <strong>Create</strong></div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">3.</span>
                  <div>选择 <strong>Workers</strong> → <strong>Import from GitHub</strong></div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">4.</span>
                  <div>授权 GitHub 并选择你 Fork 的仓库</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">5.</span>
                  <div>使用默认配置，直接点击<strong>部署</strong>（仓库已包含 wrangler.toml）</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">6.</span>
                  <div>部署完成后，进入 Settings → Variables and Secrets 添加环境变量</div>
                </li>
              </ol>
            </div>

            <!-- Paste Deploy -->
            <div id="deploy-paste" class="deploy-content hidden">
              <div class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-green-800 mb-2"><i class="fas fa-paste mr-1"></i>直接复制代码部署</h4>
                <p class="text-sm text-green-700">无需 Git，直接复制构建后的代码到 Cloudflare Workers</p>
              </div>
              <ol class="space-y-3 text-sm text-gray-600">
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">1.</span>
                  <div>登录 <a href="https://dash.cloudflare.com" target="_blank" class="text-purple-600 hover:underline">Cloudflare Dashboard</a> → Workers & Pages → <strong>Create</strong></div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">2.</span>
                  <div>选择 <strong>Workers</strong> → <strong>Create Worker</strong>（或 Hello World 模板）</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">3.</span>
                  <div>给 Worker 起名（如 <code class="bg-gray-100 px-1 rounded">anyrouter</code>），点击 <strong>Deploy</strong></div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">4.</span>
                  <div>点击 <strong>Edit code</strong> 进入在线编辑器</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">5.</span>
                  <div>
                    <strong>删除</strong>默认代码，点击下方按钮一键复制代码：
                    <div class="mt-2 flex items-center gap-2 flex-wrap">
                      <button onclick="copyWorkerCode()" id="copyWorkerBtn" class="text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow">
                        <i class="fas fa-copy mr-1"></i>一键复制 anyrouter.js
                      </button>
                      <a href="https://raw.githubusercontent.com/dext7r/anyrouter/main/anyrouter.js" target="_blank" class="text-xs text-purple-600 hover:underline"><i class="fas fa-external-link-alt mr-1"></i>或手动打开</a>
                    </div>
                    <p class="text-xs text-gray-400 mt-1" id="copyWorkerStatus"></p>
                  </div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">6.</span>
                  <div>点击右上角 <strong>Deploy</strong> 按钮</div>
                </li>
                <li class="flex items-start">
                  <span class="font-bold text-purple-600 mr-2">7.</span>
                  <div>返回 Worker 设置，添加环境变量（见下方环境变量配置）</div>
                </li>
              </ol>
              <div class="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p class="text-sm text-yellow-700"><i class="fas fa-lightbulb mr-1"></i><strong>提示</strong>：这种方式适合快速体验，但后续更新需要手动复制新代码。推荐使用 GitHub 关联方式实现自动更新。</p>
              </div>
            </div>

            <!-- CLI Deploy -->
            <div id="deploy-cli" class="deploy-content hidden">
              <div class="code-block relative mb-4">
                <pre><code class="language-bash" id="deploy-clone"># 克隆仓库
git clone https://github.com/dext7r/anyrouter.git
cd anyrouter
npm install

# 本地开发（可选）
cp wrangler.toml.example wrangler.toml.local
# 编辑 wrangler.toml.local 填入环境变量
npx wrangler dev -c wrangler.toml.local

# 部署到 Cloudflare
npm run build
npx wrangler login  # 首次需要
npx wrangler deploy
# 部署后在 Dashboard 配置环境变量</code></pre>
                <button onclick="copyCode('deploy-clone')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            </div>

            <!-- GitHub Actions -->
            <div id="deploy-actions" class="deploy-content hidden">
              <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-green-800 mb-2"><i class="fas fa-robot mr-1"></i>自动化 CI/CD</h4>
                <p class="text-sm text-green-700">推送到 main 分支时自动部署</p>
              </div>
              <p class="text-sm text-gray-600 mb-3">在仓库中创建 <code class="bg-gray-100 px-1 rounded">.github/workflows/deploy.yml</code>：</p>
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
          CLOUDFLARE_API_TOKEN: \$\{{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \$\{{ secrets.CLOUDFLARE_ACCOUNT_ID }}</code></pre>
                <button onclick="copyCode('deploy-actions-code')" class="copy-btn px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
              <div class="text-sm text-gray-600">
                <p class="mb-2"><strong>配置 GitHub Secrets：</strong></p>
                <ol class="list-decimal list-inside space-y-1 text-gray-500">
                  <li>在 Cloudflare Dashboard → My Profile → API Tokens 创建 Token</li>
                  <li>权限选择：Account - Cloudflare Workers Scripts - Edit</li>
                  <li>在 GitHub 仓库 Settings → Secrets → Actions 添加：
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
              <i class="fas fa-clipboard-list mr-2 text-purple-600"></i>准备工作
            </h3>
            <div class="bg-gray-50 rounded-lg p-4 text-sm">
              <ul class="space-y-2 text-gray-600">
                <li><i class="fas fa-check text-green-500 mr-2"></i>GitHub 账号（用于 Fork 代码仓库）</li>
                <li><i class="fas fa-check text-green-500 mr-2"></i>Cloudflare 账号（<a href="https://dash.cloudflare.com/sign-up" target="_blank" class="text-purple-600 hover:underline">免费注册</a>）</li>
                <li><i class="fas fa-check text-green-500 mr-2"></i>Supabase 账号（<a href="https://supabase.com" target="_blank" class="text-purple-600 hover:underline">免费注册</a>，可选，用于密钥管理）</li>
                <li><i class="fas fa-check text-green-500 mr-2"></i>Upstash 账号（<a href="https://upstash.com" target="_blank" class="text-purple-600 hover:underline">免费注册</a>，可选，用于 Redis 缓存和统计）</li>
              </ul>
            </div>
          </div>

          <!-- Step 3: Supabase Setup -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm mr-2">3</span>
              配置 Supabase 数据库（可选）
            </h3>
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
              <p class="text-sm text-green-700"><i class="fas fa-info-circle mr-1"></i>如果只需要直传模式，可跳过此步骤</p>
            </div>
            <ol class="space-y-3 text-sm text-gray-600">
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">a.</span>
                登录 <a href="https://supabase.com" target="_blank" class="text-purple-600 hover:underline">Supabase</a> 并创建新项目
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">b.</span>
                进入 SQL Editor，执行数据库初始化脚本：
              </li>
            </ol>
            <div class="mt-3 border border-gray-200 rounded-lg overflow-hidden">
              <div class="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all" onclick="toggleSchemaSQL()">
                <div class="flex items-center gap-2">
                  <i id="schemaSqlToggle" class="fas fa-chevron-right text-purple-600 text-xs transition-transform"></i>
                  <span class="text-xs text-gray-600 font-medium"><i class="fas fa-database mr-1"></i>schema.sql - 从 GitHub 实时获取</span>
                </div>
                <div class="flex gap-2" onclick="event.stopPropagation()">
                  <a href="https://github.com/dext7r/anyrouter/blob/main/schema.sql" target="_blank" class="text-xs text-purple-600 hover:underline"><i class="fab fa-github mr-1"></i>查看源文件</a>
                  <button onclick="loadSchemaSQL()" class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200"><i class="fas fa-sync-alt mr-1"></i>刷新</button>
                  <button onclick="copyCode('deploy-sql')" class="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700"><i class="fas fa-copy mr-1"></i>复制</button>
                </div>
              </div>
              <div id="schemaSqlContent" class="hidden">
                <div class="code-block relative rounded-none">
                  <pre style="max-height: 400px; overflow-y: auto;"><code class="language-sql" id="deploy-sql"><i class="fas fa-spinner fa-spin"></i> 正在从 GitHub 加载 schema.sql...</code></pre>
                </div>
              </div>
              <p class="text-xs text-gray-500 px-3 py-2 bg-gray-50 border-t border-gray-200"><i class="fas fa-info-circle mr-1"></i>脚本包含：建表、索引、RLS 策略、触发器、迁移逻辑（支持已有表升级）</p>
            </div>
            <ol class="space-y-3 text-sm text-gray-600 mt-3" start="3">
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">c.</span>
                进入 Settings → API，获取 <code class="bg-gray-100 px-1 rounded">Project URL</code> 和 <code class="bg-gray-100 px-1 rounded">anon/public key</code>
              </li>
            </ol>
          </div>

          <!-- Step 4: Upstash Setup -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm mr-2">4</span>
              配置 Upstash Redis（可选）
            </h3>
            <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
              <p class="text-sm text-green-700"><i class="fas fa-info-circle mr-1"></i>如果不需要统计和缓存功能，可跳过此步骤</p>
            </div>
            <ol class="space-y-3 text-sm text-gray-600">
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">a.</span>
                登录 <a href="https://upstash.com" target="_blank" class="text-purple-600 hover:underline">Upstash</a> 并创建 Redis 数据库
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">b.</span>
                选择离你最近的区域（如 US-East-1 或 AP-Northeast-1）
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">c.</span>
                在 REST API 标签页复制 <code class="bg-gray-100 px-1 rounded">UPSTASH_REDIS_REST_URL</code> 和 <code class="bg-gray-100 px-1 rounded">UPSTASH_REDIS_REST_TOKEN</code>
              </li>
            </ol>
          </div>

          <!-- Step 5: Environment Variables -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm mr-2">5</span>
              配置环境变量
            </h3>
            <p class="text-sm text-gray-600 mb-3">部署后在 Cloudflare Dashboard → Workers → 你的 Worker → Settings → Variables and Secrets 添加：</p>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200">
                    <th class="text-left py-2 px-3 font-semibold text-gray-700">变量名</th>
                    <th class="text-left py-2 px-3 font-semibold text-gray-700">必须</th>
                    <th class="text-left py-2 px-3 font-semibold text-gray-700">说明</th>
                    <th class="text-left py-2 px-3 font-semibold text-gray-700">获取方式</th>
                  </tr>
                </thead>
                <tbody class="text-gray-600">
                  <tr class="border-b border-gray-100">
                    <td class="py-2 px-3"><code class="text-purple-600">ADMIN_PASSWORD</code></td>
                    <td class="py-2 px-3"><span class="text-green-600 font-bold">✓</span></td>
                    <td class="py-2 px-3">管理面板登录密码</td>
                    <td class="py-2 px-3 text-gray-400">自定义</td>
                  </tr>
                  <tr class="border-b border-gray-100">
                    <td class="py-2 px-3"><code class="text-purple-600">SUPABASE_URL</code></td>
                    <td class="py-2 px-3"><span class="text-gray-400">可选</span></td>
                    <td class="py-2 px-3">Supabase 项目 URL</td>
                    <td class="py-2 px-3 text-xs">Supabase → Settings → API → Project URL</td>
                  </tr>
                  <tr class="border-b border-gray-100">
                    <td class="py-2 px-3"><code class="text-purple-600">SUPABASE_KEY</code></td>
                    <td class="py-2 px-3"><span class="text-gray-400">可选</span></td>
                    <td class="py-2 px-3">Supabase anon key</td>
                    <td class="py-2 px-3 text-xs">Supabase → Settings → API → anon public</td>
                  </tr>
                  <tr class="border-b border-gray-100">
                    <td class="py-2 px-3"><code class="text-purple-600">UPSTASH_REDIS_URL</code></td>
                    <td class="py-2 px-3"><span class="text-gray-400">可选</span></td>
                    <td class="py-2 px-3">Upstash Redis REST URL</td>
                    <td class="py-2 px-3 text-xs">Upstash → Redis → REST API</td>
                  </tr>
                  <tr>
                    <td class="py-2 px-3"><code class="text-purple-600">UPSTASH_REDIS_TOKEN</code></td>
                    <td class="py-2 px-3"><span class="text-gray-400">可选</span></td>
                    <td class="py-2 px-3">Upstash Redis Token</td>
                    <td class="py-2 px-3 text-xs">Upstash → Redis → REST API</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p class="text-sm text-blue-700"><i class="fas fa-info-circle mr-1"></i>不配置 Supabase/Redis 也可使用直传模式</p>
            </div>
          </div>

          <!-- Step 6: Custom Domain -->
          <div class="mb-6">
            <h3 class="font-semibold text-gray-800 mb-3 flex items-center">
              <span class="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm mr-2">6</span>
              配置自定义域名（可选）
            </h3>
            <ol class="space-y-3 text-sm text-gray-600">
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">a.</span>
                登录 Cloudflare Dashboard，进入 Workers & Pages
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">b.</span>
                选择你的 Worker，点击 Settings → Triggers → Custom Domains
              </li>
              <li class="flex items-start">
                <span class="font-bold text-purple-600 mr-2">c.</span>
                添加你的域名（域名需要已添加到 Cloudflare）
              </li>
            </ol>
          </div>

          <!-- Deployment Checklist -->
          <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 class="font-semibold text-purple-800 mb-2"><i class="fas fa-clipboard-check mr-1"></i>部署后检查清单</h4>
            <ul class="text-sm text-purple-700 space-y-1">
              <li><i class="fas fa-check-circle text-green-500 mr-1"></i>访问 <code>/</code> 查看状态页面</li>
              <li><i class="fas fa-check-circle text-green-500 mr-1"></i>访问 <code>/admin</code> 登录管理面板</li>
              <li><i class="fas fa-check-circle text-green-500 mr-1"></i>添加 API 配置并测试代理功能</li>
              <li><i class="fas fa-check-circle text-green-500 mr-1"></i>生成 SK 别名用于 SDK 配置</li>
            </ul>
          </div>
        </section>

        <!-- FAQ -->
        <section id="faq" class="section glass-effect rounded-xl p-6 shadow-lg mb-6">
          <h2 class="text-2xl font-bold text-gray-800 mb-4"><i class="fas fa-question-circle mr-2 text-purple-600"></i>常见问题</h2>

          <div class="space-y-4">
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: 如何获取 Key ID？</h3>
              <p class="text-gray-600 text-sm">登录<a href="/admin" class="text-purple-600 hover:underline">管理面板</a>，添加 API 配置后系统会自动生成 6 位 Key ID。</p>
            </div>
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: 支持哪些 API？</h3>
              <p class="text-gray-600 text-sm">支持<strong>任意 HTTP/HTTPS API</strong>，包括但不限于：OpenAI、Anthropic、Google AI、Azure OpenAI、Groq、Mistral、Cohere、HuggingFace 等。</p>
            </div>
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: 数据安全吗？</h3>
              <p class="text-gray-600 text-sm">代理服务不会存储任何请求内容，仅转发请求。API Token 存储在数据库中，传输使用 HTTPS 加密。</p>
            </div>
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: 如何自己部署？</h3>
              <p class="text-gray-600 text-sm">Fork <a href="https://github.com/dext7r/anyrouter" target="_blank" class="text-purple-600 hover:underline">GitHub 仓库</a>，配置 Cloudflare Workers 和 Supabase 数据库即可。详见仓库 README。</p>
            </div>
            <div class="border-b border-gray-100 pb-4">
              <h3 class="font-semibold text-gray-800 mb-2">Q: 有请求限制吗？</h3>
              <p class="text-gray-600 text-sm">代理服务本身无限制，但会受到 Cloudflare Workers 免费版的限制（每日 10 万请求）和目标 API 的限制。</p>
            </div>
            <div>
              <h3 class="font-semibold text-gray-800 mb-2">Q: 为什么要用代理而不是直连？</h3>
              <p class="text-gray-600 text-sm">1) 统一管理多个 API 密钥；2) 避免在客户端暴露 Token；3) 利用 Cloudflare 边缘网络加速；4) 便于监控和统计使用量。</p>
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
    // 设置代理 URL
    const proxyUrl = window.location.origin;
    document.getElementById('proxyUrl').textContent = proxyUrl;
    document.querySelectorAll('.proxy-url').forEach(el => el.textContent = proxyUrl);

    // 从 GitHub 加载 schema.sql
    const SCHEMA_SQL_URL = 'https://raw.githubusercontent.com/dext7r/anyrouter/main/schema.sql';
    let schemaSQL = '';

    async function loadSchemaSQL() {
      const el = document.getElementById('deploy-sql');
      el.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在从 GitHub 加载...';
      try {
        const response = await fetch(SCHEMA_SQL_URL);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        schemaSQL = await response.text();
        el.textContent = schemaSQL;
        hljs.highlightElement(el);
        showToast('schema.sql 加载成功');
      } catch (e) {
        el.innerHTML = '-- 加载失败: ' + e.message + '\\n-- 请访问 GitHub 查看完整脚本:\\n-- https://github.com/dext7r/anyrouter/blob/main/schema.sql';
        console.error('Failed to load schema.sql:', e);
      }
    }

    // 页面加载时自动获取 schema.sql
    loadSchemaSQL();

    // 折叠/展开 schema.sql
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

    // 复制 Worker 代码
    const WORKER_JS_URL = 'https://raw.githubusercontent.com/dext7r/anyrouter/main/anyrouter.js';
    let workerCode = '';

    async function copyWorkerCode() {
      const btn = document.getElementById('copyWorkerBtn');
      const status = document.getElementById('copyWorkerStatus');
      const originalHTML = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>正在获取...';
      status.textContent = '';

      try {
        // 如果已缓存则直接使用
        if (!workerCode) {
          const response = await fetch(WORKER_JS_URL);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          workerCode = await response.text();
        }

        await navigator.clipboard.writeText(workerCode);
        btn.innerHTML = '<i class="fas fa-check mr-1"></i>已复制！';
        status.innerHTML = '<i class="fas fa-check-circle text-green-500 mr-1"></i>代码已复制到剪贴板，请粘贴到 Cloudflare 编辑器';
        showToast('Worker 代码已复制，请粘贴到 Cloudflare');

        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.disabled = false;
        }, 3000);
      } catch (e) {
        btn.innerHTML = '<i class="fas fa-times mr-1"></i>复制失败';
        status.innerHTML = '<i class="fas fa-exclamation-circle text-red-500 mr-1"></i>获取失败: ' + e.message + '，请<a href="' + WORKER_JS_URL + '" target="_blank" class="text-purple-600 underline">手动打开</a>复制';
        console.error('Failed to copy worker code:', e);

        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.disabled = false;
        }, 3000);
      }
    }

    // 代码高亮
    hljs.highlightAll();

    // 复制功能
    function copyToClipboard(elementId) {
      const text = document.getElementById(elementId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板');
      });
    }

    function copyCode(elementId) {
      const el = document.getElementById(elementId);
      let text = el.textContent;
      // 如果是 schema.sql 且已加载，使用缓存内容
      if (elementId === 'deploy-sql' && schemaSQL) {
        text = schemaSQL;
      } else {
        text = text.replace(/<span class="proxy-url"><\\/span>/g, proxyUrl);
      }
      navigator.clipboard.writeText(text).then(() => {
        showToast('代码已复制');
      });
    }

    function showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 px-4 py-2 bg-gray-800 text-white rounded-lg shadow-lg z-50';
      toast.innerHTML = '<i class="fas fa-check-circle mr-2"></i>' + message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    // TOC 左右收起/展开
    function toggleTOC() {
      const sidebar = document.getElementById('tocSidebar');
      sidebar.classList.toggle('collapsed');
    }

    // 部署方式 Tab 切换
    function showDeployTab(tabName) {
      // 隐藏所有内容
      document.querySelectorAll('.deploy-content').forEach(el => el.classList.add('hidden'));
      // 重置所有 tab 样式
      document.querySelectorAll('.deploy-tab').forEach(el => {
        el.classList.remove('text-purple-600', 'border-b-2', 'border-purple-600');
        el.classList.add('text-gray-500');
      });
      // 显示选中内容
      document.getElementById('deploy-' + tabName).classList.remove('hidden');
      // 激活选中 tab
      const activeTab = document.getElementById('tab-' + tabName);
      activeTab.classList.remove('text-gray-500');
      activeTab.classList.add('text-purple-600', 'border-b-2', 'border-purple-600');
    }

    // TOC 高亮
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
  </script>
</body>
</html>`
}
