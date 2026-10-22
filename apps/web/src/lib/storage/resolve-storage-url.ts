import { absoluteUrl } from "@rallly/utils/absolute-url";

/**
 * Resolves a storage key to an absolute URL.
 *
 * 1. If the key is already an absolute URL (e.g. OAuth avatars) or a data URI → returned as-is.
 * 2. If `NEXT_PUBLIC_CDN_BASE_URL` is set → served directly from the CDN/bucket.
 * 3. Otherwise → proxied through `/api/storage/`.
 *
 * Reads `process.env` directly rather than the validated `env` object so this
 * stays safe to import from client components (same pattern as absolute-url.ts).
 * Importing `@/env` here pulls its client-side validation into the browser
 * bundle, which crashes self-hosted builds where `NEXT_PUBLIC_BASE_URL` is set
 * at runtime and is therefore absent on the client.
 */
/**
 * Whether a stored image value is a key in our storage bucket, as opposed to
 * an external URL or data URI.
 */
export function isStorageKey(value: string): boolean {
  return !(
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("data:") ||
    isDesignAssetRef(value)
  );
}

/**
 * Files uploaded in the design settings live in the database rather than the
 * bucket. A stored value `asset:<key>:<version>` points at one of them; the
 * version is the upload time, so the URL changes whenever the file does and
 * the route can be cached as immutable.
 */
const DESIGN_ASSET_PREFIX = "asset:";

export function isDesignAssetRef(value: string) {
  return value.startsWith(DESIGN_ASSET_PREFIX);
}

export function toDesignAssetRef(key: string, version: number) {
  return `${DESIGN_ASSET_PREFIX}${key}:${version}`;
}

export function getDesignAssetUrl(key: string, version?: number) {
  const path = `/api/instance-assets/${encodeURIComponent(key)}`;
  return absoluteUrl(version ? `${path}?v=${version}` : path);
}

export function resolveStorageUrl(key: string): string {
  if (isDesignAssetRef(key)) {
    const [assetKey = "", version] = key
      .slice(DESIGN_ASSET_PREFIX.length)
      .split(":");
    return getDesignAssetUrl(assetKey, Number(version) || undefined);
  }

  if (!isStorageKey(key)) {
    return key;
  }

  const normalizedKey = key.replace(/^\/+/, "");

  const cdnBaseUrl = process.env.NEXT_PUBLIC_CDN_BASE_URL;
  if (cdnBaseUrl) {
    const base = cdnBaseUrl.replace(/\/+$/, "");
    return `${base}/${normalizedKey}`;
  }

  return absoluteUrl(`/api/storage/${normalizedKey}`);
}
