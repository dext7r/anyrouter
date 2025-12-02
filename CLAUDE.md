# AnyRouter - 项目说明

## 项目概述

AnyRouter 是一个运行在 Cloudflare Workers 上的通用 API 代理服务，支持 OpenAI、Anthropic、Google、Azure、Groq 等任意 HTTP API 的统一转发。

## 技术栈

- **运行时**: Cloudflare Workers (ES Module)
- **构建工具**: esbuild
- **数据库**: Supabase (PostgreSQL) - 可选
- **缓存**: Upstash Redis - 可选
- **前端**: 原生 HTML + Tailwind CSS + jQuery

## 项目结构

```
src/
├── index.js          # 入口文件，路由分发
├── config.js         # 配置常量（缓存TTL等）
├── handlers/
│   ├── proxy.js      # 代理请求处理（核心逻辑）
│   └── api.js        # 管理 API 接口
├── pages/
│   ├── admin.js      # 管理面板 HTML
│   ├── docs.js       # 文档页面 HTML
│   └── status.js     # 状态页面 HTML
├── cache/
│   ├── index.js      # 缓存管理（内存/Redis/KV）
│   ├── redis.js      # Upstash Redis REST 客户端
│   └── stats.js      # 统计和黑名单（Redis）
├── db/
│   └── supabase.js   # 数据库操作
└── utils/
    └── helpers.js    # 工具函数
```

## 构建和部署

```bash
# 安装依赖
npm install

# 构建（生成 anyrouter.js 和 _worker.js）
npm run build

# 本地开发
cp wrangler.toml.example wrangler.toml.local
# 编辑 wrangler.toml.local 填入环境变量
npx wrangler dev -c wrangler.toml.local

# 部署
npx wrangler deploy
```

## 环境变量

| 变量 | 必须 | 说明 |
|------|------|------|
| `ADMIN_PASSWORD` | ✅ | 管理面板登录密码 |
| `SUPABASE_URL` | ❌ | Supabase 项目 URL |
| `SUPABASE_KEY` | ❌ | Supabase anon key |
| `UPSTASH_REDIS_URL` | ❌ | Upstash Redis REST URL |
| `UPSTASH_REDIS_TOKEN` | ❌ | Upstash Redis Token |

## 三种认证模式

1. **SK 别名模式**（推荐）: `Bearer sk-ar-xxxxxxxx`
2. **Key ID 模式**: `Bearer https://api.openai.com:a3x9k2`
3. **直传模式**: `Bearer https://api.openai.com:sk-xxx...`

## 路由

| 路由 | 说明 |
|------|------|
| `/` | 状态页 |
| `/docs` | 使用文档 |
| `/admin` | 管理面板 |
| `/api/*` | 管理 API |
| `/*` | 代理请求 |

## 关键文件说明

- `wrangler.toml` - 部署配置（无敏感信息，可提交）
- `wrangler.toml.example` - 本地开发配置模板
- `wrangler.toml.local` - 本地开发配置（被 gitignore）
- `schema.sql` - Supabase 数据库初始化脚本
- `build.js` - esbuild 构建脚本

## 开发注意事项

1. 代码修改后需要运行 `npm run build` 重新构建
2. 敏感信息不要写入 `wrangler.toml`，通过 Dashboard 配置
3. Redis 和 Supabase 都是可选的，不配置时使用直传模式
4. 前端页面在 `src/pages/` 目录，是纯 HTML 字符串模板
