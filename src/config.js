// ============ 配置常量 ============

// 构建时间（部署时自动替换）
export const BUILD_TIME = '__BUILD_TIME__'

// 本地配置（如果没有数据库，使用此配置作为 fallback）
export const FALLBACK_CONFIG = {}

// 缓存配置
export const CONFIG_CACHE_TTL_MS = 10 * 60 * 1000 // 10 分钟（内存缓存）
export const REDIS_CACHE_TTL_SECONDS = 5 * 60 // 5 分钟（Redis 缓存）
export const KV_CACHE_TTL_SECONDS = 5 * 60 // 5 分钟（KV 缓存，备用）
export const CACHE_KEY = 'anyrouter:api_configs'

// 默认管理员密码
export const DEFAULT_ADMIN_PASSWORD = '123456'
