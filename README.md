# AnyRouter

通用 API 代理服务，支持 OpenAI、Anthropic、Google、Azure、Groq 等任意 HTTP API 的统一转发。

## 特性

- **通用代理** - 支持任意 HTTP/HTTPS API
- **三种认证模式** - SK 别名 / Key ID / 直传 Token
- **统计与监控** - 请求统计、IP 排行、黑名单管理
- **边缘加速** - 基于 Cloudflare 全球网络

## 部署

### 方式一：一键部署（推荐）

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dext7r/anyrouter)

### 方式二：GitHub 关联部署

1. Fork 本仓库到你的 GitHub 账号
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → Create
3. 选择 **Workers** → Import from GitHub → 选择你 Fork 的仓库
4. 使用默认配置，点击部署
5. 部署后进入 Settings → Variables and Secrets，添加环境变量

### 方式三：命令行部署

```bash
git clone https://github.com/dext7r/anyrouter.git
cd anyrouter
npm install

# 本地开发：复制示例配置并填入你的配置
cp wrangler.toml.example wrangler.toml.local
# 编辑 wrangler.toml.local 填入环境变量
npx wrangler dev -c wrangler.toml.local

# 部署到 Cloudflare
npm run build
npx wrangler deploy
# 然后在 Dashboard 配置环境变量
```

### 方式四：GitHub Actions

```yaml
name: Deploy
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
      - run: npm install && npm run build
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

## 环境变量

| 变量 | 必须 | 说明 |
|------|------|------|
| `ADMIN_PASSWORD` | ✅ | 管理面板登录密码 |
| `SUPABASE_URL` | ❌ | Supabase 项目 URL |
| `SUPABASE_KEY` | ❌ | Supabase anon key |
| `UPSTASH_REDIS_URL` | ❌ | Upstash Redis REST URL |
| `UPSTASH_REDIS_TOKEN` | ❌ | Upstash Redis Token |

> 不配置 Supabase/Redis 也可使用直传模式

## 使用

```bash
# SK 别名模式（推荐）
curl -H "Authorization: Bearer sk-ar-xxxxxxxx" https://your-proxy/v1/chat/completions

# Key ID 模式
curl -H "Authorization: Bearer https://api.openai.com:a3x9k2" https://your-proxy/v1/chat/completions

# 直传模式
curl -H "Authorization: Bearer https://api.openai.com:sk-xxx" https://your-proxy/v1/chat/completions
```

## 路由

| 路由 | 说明 |
|------|------|
| `/` | 状态页 |
| `/docs` | 完整文档 |
| `/admin` | 管理面板 |
| `/*` | 代理请求 |

## License

MIT
