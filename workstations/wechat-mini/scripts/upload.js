const path = require('path')
const os = require('os')
const fs = require('fs')
const ci = require('miniprogram-ci')
const pkg = require('../package.json')

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
  const appid = requiredEnv('WECHAT_MINI_APPID', 'wxf4ed2ed0eb687e31')
  const privateKeyPath = resolveHomePath(
    requiredEnv(
      'WECHAT_MINI_PRIVATE_KEY_PATH',
      '~/Downloads/private.wxf4ed2ed0eb687e31.key'
    )
  )
  const robot = Number(process.env.WECHAT_MINI_ROBOT || '1')
  const version = process.env.WECHAT_MINI_VERSION || pkg.version || '1.0.0'
  const desc = process.env.WECHAT_MINI_DESC || `CI upload ${new Date().toISOString()}`
  const projectPath = path.resolve(__dirname, '..')

  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Private key file not found: ${privateKeyPath}`)
  }

  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**/*'],
  })

  console.log('[wechat-mini] start upload')
  console.log(`[wechat-mini] appid=${appid} version=${version} robot=${robot}`)

  const uploadResult = await ci.upload({
    project,
    version,
    desc,
    robot,
    setting: {
      es6: true,
      minify: false,
      minifyJS: false,
      minifyWXML: false,
      minifyWXSS: false,
      autoPrefixWXSS: true,
    },
    onProgressUpdate: (progress) => {
      if (typeof progress._status === 'string') {
        console.log(`[wechat-mini] ${progress._status} ${progress._message || ''}`)
      }
    },
  })

  console.log('[wechat-mini] upload success')
  if (uploadResult && uploadResult.subPackageInfo) {
    console.log('[wechat-mini] subpackage info detected')
  }
}

main().catch((err) => {
  console.error('[wechat-mini] upload failed')
  console.error(err && err.message ? err.message : err)
  process.exit(1)
})
