#!/usr/bin/env node
/**
 * 质量门禁：禁止源代码中硬编码 utest.cc 域名
 *
 * 微信小程序使用云托管，飞书工作台使用相对路径，React Native 使用环境变量。
 * 任何源代码中不得出现 utest.cc 作为 API 默认地址。
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

const SOURCE_DIRS = [
  'packages/api-client/src',
  'apps/wechat-mini/src',
  'apps/mobile-rn/src',
]

const FORBIDDEN_PATTERN = /utest\.cc/gi

const violations = []

function scanDir(dirPath) {
  if (!fs.existsSync(dirPath)) return
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      scanDir(full)
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (FORBIDDEN_PATTERN.test(lines[i])) {
          violations.push({ file: full, line: i + 1, text: lines[i].trim() })
        }
        FORBIDDEN_PATTERN.lastIndex = 0
      }
    }
  }
}

for (const dir of SOURCE_DIRS) {
  scanDir(path.join(root, dir))
}

if (violations.length > 0) {
  console.error('[no-utest-cc-gate] FAILED — 发现源代码中硬编码 utest.cc')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`)
  }
  console.error('')
  console.error('[no-utest-cc-gate] 微信小程序使用云托管，飞书工作台使用相对路径，RN 使用环境变量。')
  console.error('[no-utest-cc-gate] 禁止在源代码中硬编码 utest.cc 域名作为 API 地址。')
  process.exit(1)
}

console.log('[no-utest-cc-gate] PASSED — 源代码中未发现 utest.cc 硬编码')
