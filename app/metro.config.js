// Lets the app import the shared rules/catalog package from ../packages/shared.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../packages/shared');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@roadpals/shared': path.join(sharedRoot, 'src'),
};
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
