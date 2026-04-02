const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Exclude .local/skills — agent-only content with transient dirs that can vanish
// and crash Metro's file watcher.
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const skillsPath = escapeRegExp(path.join(workspaceRoot, ".local", "skills"));
config.resolver.blockList = [new RegExp(`^${skillsPath}.*`)];

module.exports = config;
