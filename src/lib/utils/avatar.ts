export function getAvatarUrl(url: string | null | undefined, size: number): string | null {
  if (!url) return null;
  // Supabase Storage Transform API — resizes on CDN, cached automatically
  return url.replace(
    '/storage/v1/object/public/',
    `/storage/v1/render/image/public/`
  ) + `?width=${size}&height=${size}&resize=cover&quality=80`;
}
