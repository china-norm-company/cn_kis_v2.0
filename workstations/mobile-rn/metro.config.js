const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// monorepo: watch all packages
config.watchFolders = [workspaceRoot]

// monorepo: resolve modules from workspace root first, then project
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// monorepo: resolve main fields
config.resolver.disableHierarchicalLookup = false
if (!config.resolver.assetExts.includes('apng')) {
  config.resolver.assetExts.push('apng')
}

module.exports = config
