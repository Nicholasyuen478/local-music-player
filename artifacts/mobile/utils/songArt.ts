const DEFAULT_IMAGES = [
  require("../assets/images/icon.png"),
];

export function getRandomImageUri(imagePool: string[]): string | null {
  if (imagePool.length === 0) return null;
  const idx = Math.floor(Math.random() * imagePool.length);
  return imagePool[idx];
}

export function getDefaultImage() {
  return DEFAULT_IMAGES[0];
}
