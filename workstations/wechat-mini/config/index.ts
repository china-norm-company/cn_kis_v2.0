import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'node:path'

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
        : JSON.stringify('http://localhost:8001/api/v1'),
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
        include: [path.resolve(__dirname, '../../packages/subject-core')],
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
      esnextModules: ['@cn-kis/subject-core'],
      devServer: {
        client: {
          overlay: false,
        },
      },
      webpackChain(chain) {
        chain.module
          .rule('script')
          .include
          .add(path.resolve(__dirname, '../../packages/subject-core/src'))
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
