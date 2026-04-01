#!/usr/bin/env node
// Patches expo-modules-core so Node 24 doesn't reject its "main" pointing to a .ts file.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const pnpmDir = new URL("../node_modules/.pnpm", import.meta.url).pathname;

let patched = 0;
for (const entry of readdirSync(pnpmDir)) {
  if (!entry.startsWith("expo-modules-core@")) continue;
  const pkgPath = join(pnpmDir, entry, "node_modules", "expo-modules-core", "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.main === "src/index.ts") {
    pkg.main = "./index.js";
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    patched++;
    console.log("Patched expo-modules-core at", pkgPath);
  }
}
if (patched === 0) console.log("expo-modules-core already patched or not found.");
