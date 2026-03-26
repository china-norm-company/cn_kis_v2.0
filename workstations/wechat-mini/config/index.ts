import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'node:path'

/** 相对本文件（config/）到仓库根下 packages/subject-core */
const subjectCoreRoot = path.resolve(__dirname, '../../../packages/subject-core')
const subjectCoreEntry = path.join(subjectCoreRoot, 'src/index.ts')
const consentPlaceholdersRoot = path.resolve(__dirname, '../../../packages/consent-placeholders')
const consentPlaceholdersEntry = path.join(consentPlaceholdersRoot, 'src/index.ts')
const srcRoot = path.resolve(__dirname, '../src')

export default defineConfig(async (merge) => {
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
    },
    copy: {
      patterns: [
        { from: 'src/assets/hero-brand.apng', to: 'dist/assets/hero-brand.apng' },
        { from: 'src/assets/hero-brand.gif', to: 'dist/assets/hero-brand.gif' },
      ],
      options: {},
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false,
    },
    mini: {
      compile: {
        // Taro 3.6 config schema does not accept RegExp here.
        include: [subjectCoreRoot, consentPlaceholdersRoot],
      },
      webpackChain(chain) {
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
