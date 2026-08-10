// client/src/components/AssetThumbnail.tsx
import type { CSSProperties } from 'react';
import { api } from '../lib/api.js';
import { useAuthedImageUrl } from '../hooks/useAuthedImageUrl.js';

/**
 * Renders an asset's file as an <img>, authenticated. GET /assets/:id/file
 * requires a bearer token, so a bare <img src={api.assetFileUrl(id)}> would
 * 401 — this fetches the bytes with the auth header and swaps in a blob
 * object URL instead.
 */
export default function AssetThumbnail(props: {
  assetId: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { assetId, alt, className, style } = props;
  const { objectUrl, loading } = useAuthedImageUrl(api.assetFileUrl(assetId));

  if (!objectUrl) {
    return (
      <div
        className={className}
        style={{ ...style, opacity: loading ? 0.5 : 1 }}
        aria-label={loading ? 'Loading…' : 'Failed to load image'}
      />
    );
  }

  return <img src={objectUrl} alt={alt} className={className} style={style} />;
}
