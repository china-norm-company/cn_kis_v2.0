import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import fs from 'node:fs'
import path from 'node:path'

/** 相对本文件（config/）到仓库根下 packages/subject-core */
const subjectCoreRoot = path.resolve(__dirname, '../../../packages/subject-core')
const subjectCoreEntry = path.join(subjectCoreRoot, 'src/index.ts')
const consentPlaceholdersRoot = path.resolve(__dirname, '../../../packages/consent-placeholders')
const consentPlaceholdersEntry = path.join(consentPlaceholdersRoot, 'src/index.ts')
const srcRoot = path.resolve(__dirname, '../src')

/**
 * 加载 `workstations/wechat-mini/.env.local`（不提交），便于只填一次 TARO_APP_DIARY_PROJECT_ID。
 * 已在 shell 中设置的环境变量优先生效。
 */
function loadWechatMiniEnvLocal(): void {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq <= 0) continue
    const key = s.slice(0, eq).trim()
    let val = s.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val
    }
  }
}

loadWechatMiniEnvLocal()

export default defineConfig(async (merge) => {
  /** 仅当设置 TARO_APP_DIARY_PROJECT_ID 时固定项目；不设则走后端按入组自动匹配 */
  const diaryPidRaw = process.env.TARO_APP_DIARY_PROJECT_ID
  const diaryPidTrimmed = diaryPidRaw != null ? String(diaryPidRaw).trim() : ''
  const diaryProjectId = diaryPidTrimmed
  const baseConfig: UserConfigExport = {
    projectName: 'cn-kis-subject',
    date: '2026-02-15',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
      375: 2 / 1,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [],
    defineConstants: {
      // 默认请求本地后端；覆盖：TARO_APP_API_BASE=https://your-api.com/api/v1 pnpm build:weapp
      'process.env.TARO_APP_API_BASE': (process.env.TARO_APP_API_BASE && process.env.TARO_APP_API_BASE.trim())
        ? JSON.stringify(process.env.TARO_APP_API_BASE.trim())
        : (process.env.NODE_ENV !== 'production'
          ? JSON.stringify('http://127.0.0.1:8001/api/v1')
          : JSON.stringify('')),
      'process.env.TARO_APP_USE_DIRECT_API': JSON.stringify(
        (process.env.TARO_APP_USE_DIRECT_API || '').trim(),
      ),
      'process.env.TARO_APP_DIARY_PROJECT_ID': JSON.stringify(diaryProjectId),
    },
    copy: {
      patterns: [
        { from: 'src/assets/hero-brand.apng', to: 'dist/assets/hero-brand.apng' },
        { from: 'src/assets/hero-brand.gif', to: 'dist/assets/hero-brand.gif' },
      ],
      options: {},
    },
    framework: 'react',
    /**
     * 关闭依赖预编译（prebundle）。仅 dev --watch 时易在 dist/prebundle 产出引用；
     * 纯 `taro build` 后 dist 常无该目录，微信开发者工具若仍按 prebundle 路径读文件会 ENOENT 导致整端白屏。
     */
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    cache: {
      enable: false,
    },
    mini: {
      compile: {
        // Taro 3.6 config schema does not accept RegExp here.
        include: [subjectCoreRoot, consentPlaceholdersRoot],
      },
      webpackChain(chain) {
        chain.resolve.alias.set('@cn-kis/subject-core/constants/copy', path.join(subjectCoreRoot, 'src/constants/copy.ts'))
        chain.resolve.alias.set('@cn-kis/subject-core', subjectCoreEntry)
        chain.resolve.alias.set('@cn-kis/consent-placeholders', consentPlaceholdersEntry)
        chain.resolve.alias.set('@', srcRoot)

        // Suppress AssetsOverSizeLimitWarning: allow assets up to 1MB
        chain.performance
          .maxAssetSize(1024 * 1024)
          .maxEntrypointSize(1024 * 1024)

        // Suppress NoAsyncChunksWarning: not applicable to WeChat Mini-Programs
        // as Taro handles page-level code splitting automatically
        chain.plugins.delete('NoAsyncChunksWarning')
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        url: {
          enable: true,
          config: {
            limit: 1024,
          },
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      esnextModules: ['@cn-kis/subject-core', '@cn-kis/consent-placeholders'],
      devServer: {
        client: {
          overlay: false,
        },
      },
      webpackChain(chain) {
        chain.resolve.alias.set('@cn-kis/subject-core/constants/copy', path.join(subjectCoreRoot, 'src/constants/copy.ts'))
        chain.resolve.alias.set('@cn-kis/subject-core', subjectCoreEntry)
        chain.resolve.alias.set('@cn-kis/consent-placeholders', consentPlaceholdersEntry)
        chain.resolve.alias.set('@', srcRoot)
        chain.module
          .rule('script')
          .include
          .add(path.join(subjectCoreRoot, 'src'))
          .add(path.join(consentPlaceholdersRoot, 'src'))
          .end()
        chain.devServer.merge({
          client: {
            overlay: false,
          },
        })
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
  }

  return merge({}, baseConfig)
})
