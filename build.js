#!/usr/bin/env node
// ============ 构建脚本 ============
// 使用 esbuild 将 src/ 目录打包成单文件
// 输出 anyrouter.js（本地用）和 _worker.js（Cloudflare GitHub 部署用）

import * as esbuild from 'esbuild'
import { readFileSync, writeFileSync, copyFileSync } from 'fs'

const buildTime = new Date().toISOString()

await esbuild.build({
  entryPoints: ['src/index.js'],
  bundle: true,
  outfile: 'anyrouter.js',
  format: 'esm',
  target: 'es2022',
  minify: false, // 保持可读性，便于调试
  banner: {
    js: `// AnyRouter - API Proxy Service
// Built at: ${buildTime}
// https://github.com/dext7r/anyrouter
`,
  },
})

// 替换 BUILD_TIME 占位符（esbuild 可能用单引号或双引号）
let content = readFileSync('anyrouter.js', 'utf-8')
content = content.replace(/"__BUILD_TIME__"/g, `"${buildTime}"`)
content = content.replace(/'__BUILD_TIME__'/g, `'${buildTime}'`)
writeFileSync('anyrouter.js', content)

// 复制为 _worker.js（Cloudflare Workers GitHub 部署的默认入口）
copyFileSync('anyrouter.js', '_worker.js')

console.log(`✓ Built anyrouter.js and _worker.js at ${buildTime}`)
