const path = require('path')
const os = require('os')
const fs = require('fs')
const ci = require('miniprogram-ci')

function resolveHomePath(input) {
  if (!input) return input
  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2))
  }
  return input
}

function requiredEnv(name, fallback) {
  const value = process.env[name] || fallback
  if (!value) {
    throw new Error(`Missing required value: ${name}`)
  }
  return value
}

async function main() {
  const appid = requiredEnv('WECHAT_MINI_APPID', 'wx2019d5560fe47b1d')
  const privateKeyPath = resolveHomePath(
    requiredEnv('WECHAT_MINI_PRIVATE_KEY_PATH', '~/Downloads/private.wx2019d5560fe47b1d.key')
  )
  const desc = process.env.WECHAT_MINI_PREVIEW_DESC || `CI preview ${new Date().toISOString()}`
  const projectPath = path.resolve(__dirname, '..')
  const outputPng = path.resolve(projectPath, 'test-results', 'wechat-preview-ci.png')

  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Private key file not found: ${privateKeyPath}`)
  }

  fs.mkdirSync(path.dirname(outputPng), { recursive: true })
  if (fs.existsSync(outputPng)) {
    fs.unlinkSync(outputPng)
  }

  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**/*'],
  })

  console.log('[wechat-mini] start ci preview qrcode')
  console.log(`[wechat-mini] appid=${appid}`)

  await ci.preview({
    project,
    desc,
    setting: {
      es6: true,
      minify: false,
      minifyJS: false,
      minifyWXML: false,
      minifyWXSS: false,
      autoPrefixWXSS: true,
    },
    qrcodeFormat: 'image',
    qrcodeOutputDest: outputPng,
    onProgressUpdate: (progress) => {
      if (typeof progress._status === 'string') {
        console.log(`[wechat-mini] ${progress._status} ${progress._message || ''}`)
      }
    },
  })

  console.log('[wechat-mini] preview qrcode generated')
  console.log(outputPng)
}

main().catch((err) => {
  console.error('[wechat-mini] preview failed')
  console.error(err && err.message ? err.message : err)
  process.exit(1)
})
