/** Public CDN URL or proxied upload path for an asset. */
export function assetFileUrl(asset: { storedPath: string; publicUrl: string | null }): string {
  if (asset.publicUrl) return asset.publicUrl;
  const enc = asset.storedPath.split("/").map(encodeURIComponent).join("/");
  return `/api/files/${enc}`;
}
