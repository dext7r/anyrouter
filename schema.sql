-- AnyRouter 数据库初始化脚本
-- 在 Supabase SQL Editor 中一次性执行此脚本
--
-- 使用说明：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 复制粘贴此脚本并执行

-- ============================================
-- 1. 创建表
-- ============================================
CREATE TABLE IF NOT EXISTS public.api_configs (
  id BIGSERIAL PRIMARY KEY,
  api_url TEXT NOT NULL,
  token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. 创建索引（加速查询）
-- ============================================
CREATE INDEX IF NOT EXISTS idx_api_configs_api_url ON public.api_configs(api_url);
CREATE INDEX IF NOT EXISTS idx_api_configs_enabled ON public.api_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_api_configs_created_at ON public.api_configs(created_at DESC);

-- ============================================
-- 3. 启用行级安全 (RLS)
-- ============================================
ALTER TABLE public.api_configs ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略（避免重复执行报错）
DROP POLICY IF EXISTS "Allow all access with service role" ON public.api_configs;

-- 创建策略：允许所有已认证的请求访问
-- 注意：使用 anon key 访问时，JWT 中 role = 'anon'
-- 使用 service_role key 时会绕过 RLS
CREATE POLICY "Allow all access with service role"
  ON public.api_configs
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 4. 创建更新时间触发器
-- ============================================
-- 创建更新时间函数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 删除已存在的触发器（避免重复执行报错）
DROP TRIGGER IF EXISTS update_api_configs_updated_at ON public.api_configs;

-- 创建触发器
CREATE TRIGGER update_api_configs_updated_at
  BEFORE UPDATE ON public.api_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 5. 添加注释
-- ============================================
COMMENT ON TABLE public.api_configs IS 'API 代理配置表';
COMMENT ON COLUMN public.api_configs.id IS '自增主键（用于 Token ID 引用）';
COMMENT ON COLUMN public.api_configs.api_url IS '目标 API 地址';
COMMENT ON COLUMN public.api_configs.token IS 'API Token';
COMMENT ON COLUMN public.api_configs.enabled IS '是否启用';
COMMENT ON COLUMN public.api_configs.created_at IS '创建时间';
COMMENT ON COLUMN public.api_configs.updated_at IS '更新时间';

-- ============================================
-- 6. 授权（确保 anon 和 authenticated 角色可访问）
-- ============================================
GRANT ALL ON public.api_configs TO anon;
GRANT ALL ON public.api_configs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.api_configs_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.api_configs_id_seq TO authenticated;

-- ============================================
-- 完成！
-- ============================================
-- 执行成功后，你可以在 Table Editor 中看到 api_configs 表
