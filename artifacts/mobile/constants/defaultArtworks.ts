import { Asset } from "expo-asset";

// Bundled default artwork images — loaded via expo-asset to get local file:// URIs
const DEFAULT_ARTWORK_MODULES = [
  require("../assets/images/defaults/art1.png"),
  require("../assets/images/defaults/art2.png"),
  require("../assets/images/defaults/art3.png"),
  require("../assets/images/defaults/art4.png"),
  require("../assets/images/defaults/art5.png"),
  require("../assets/images/defaults/art6.png"),
];

let _resolved: string[] | null = null;

export async function getDefaultArtworkUris(): Promise<string[]> {
  if (_resolved) return _resolved;
  const assets = await Asset.loadAsync(DEFAULT_ARTWORK_MODULES);
  _resolved = assets.map((a) => a.localUri ?? a.uri).filter(Boolean) as string[];
  return _resolved;
}
