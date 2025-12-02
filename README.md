# AnyRouter

一个轻量级 API 代理服务，支持多 API 端点和多 Token 管理，基于 Cloudflare Workers 构建。

> **演示环境**: [proxyanyrouter.jhun.edu.kg](https://proxyanyrouter.jhun.edu.kg)
> **演示密码**: `123456`

## 特性

- **多 API 端点**：支持代理到任意 API 地址
- **多 Token 管理**：每个 API 可配置多个 Token
- **双模式认证**：支持 Key ID 查找或直接传递 Token
- **Web 管理界面**：可视化配置管理，内置使用指南
- **数据持久化**：Supabase PostgreSQL 存储
- **请求头过滤**：自动移除 Cloudflare 特有 headers
- **CORS 支持**：跨域请求友好

## 快速开始

### 方式一：一键部署（推荐）

点击下方按钮，自动 Fork 并部署到你的 Cloudflare 账户：

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dext7r/anyrouter)

部署后设置环境变量（可选）：
1. 进入 Cloudflare Dashboard → Workers → 你的 Worker → Settings → Variables
2. 添加 `ADMIN_PASSWORD`（默认为 `123456`）
3. 添加 `SUPABASE_URL` 和 `SUPABASE_KEY`（用于持久化存储）

> 未设置 `ADMIN_PASSWORD` 时，默认密码为 `123456`，建议生产环境修改

### 方式二：命令行部署

```bash
# 克隆仓库
git clone https://github.com/dext7r/anyrouter.git
cd anyrouter

# 安装 wrangler
npm install -g wrangler

# 登录
wrangler login

# 设置密钥
wrangler secret put ADMIN_PASSWORD
wrangler secret put SUPABASE_URL      # 可选
wrangler secret put SUPABASE_KEY      # 可选

# 部署
wrangler deploy
```

### 配置数据库（可选）

如需持久化存储 Token 配置：

1. 登录 [Supabase](https://supabase.com/) 创建项目
2. 在 SQL Editor 中执行 `schema.sql`
3. 获取 Project URL 和 Anon Key，配置到环境变量

> 不配置数据库时，可使用直传 Token 模式（模式二）

### 访问管理面板

```
https://your-worker.workers.dev/admin
```

## 使用方法

### 请求格式

```
Authorization: Bearer <API_URL>:<Key ID 或 Token>
```

### 模式一：使用 Key ID

从管理面板获取 6 位随机 Key ID（字母+数字），系统自动查找对应 Token：

```bash
curl -X POST 'https://your-proxy.workers.dev/v1/chat/completions' \
  -H 'Authorization: Bearer https://api.openai.com:a3x9k2' \
  -H 'Content-Type: application/json' \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello"}]}'
```

### 模式二：直接传递 Token

无需配置数据库，直接传递 Token：

```bash
curl -X POST 'https://your-proxy.workers.dev/v1/chat/completions' \
  -H 'Authorization: Bearer https://api.openai.com:sk-your-api-key' \
  -H 'Content-Type: application/json' \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hello"}]}'
```

### OpenAI SDK 兼容

```python
from openai import OpenAI

client = OpenAI(
    base_url='https://your-proxy.workers.dev/v1',
    api_key='https://api.openai.com:a3x9k2'  # 格式: api_url:key_id 或 api_url:token
)

response = client.chat.completions.create(
    model='gpt-4',
    messages=[{'role': 'user', 'content': 'Hello'}]
)
```

## 管理 API

所有管理 API 需要 Authorization header：

```
Authorization: Bearer <ADMIN_PASSWORD>
```

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/configs` | 获取所有配置 |
| POST | `/api/configs` | 添加配置 |
| PATCH | `/api/configs/:id` | 更新配置 |
| DELETE | `/api/configs/:id` | 删除配置 |

### 添加配置示例

```bash
curl -X POST 'https://your-proxy.workers.dev/api/configs' \
  -H 'Authorization: Bearer your-admin-password' \
  -H 'Content-Type: application/json' \
  -d '{
    "api_url": "https://api.openai.com",
    "token": "sk-xxxxx",
    "enabled": true
  }'
```

## 路由说明

| 路由 | 说明 |
|------|------|
| `/` | 状态页面 |
| `/admin` | 管理界面（含使用指南） |
| `/api/*` | 管理 API |
| `/*` | 代理请求 |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|------|
| `ADMIN_PASSWORD` | 管理员密码 | `123456` |
| `SUPABASE_URL` | Supabase 项目 URL | - |
| `SUPABASE_KEY` | Supabase Anon Key | - |

> 不配置数据库时可使用直传 Token 模式

## 本地开发

```bash
# 复制配置
cp wrangler.toml wrangler.toml.local

# 编辑 wrangler.toml.local，取消 [vars] 注释并填入实际值

# 启动开发服务器
wrangler dev -c wrangler.toml.local
```

## 安全建议

1. 使用强管理员密码
2. 仅通过 HTTPS 访问
3. 定期更换 API Token
4. Supabase 启用 RLS 策略

## 许可

MIT License
