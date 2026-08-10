// client/src/hooks/useAuthedImageUrl.ts
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';

/**
 * Fetches a same-origin (proxied) resource that requires an Authorization
 * header — e.g. GET /assets/:id/file — as a blob, and exposes it as an
 * object URL suitable for an <img src>. A bare <img src={url}> can't attach
 * headers, so authenticated file endpoints need this fetch-then-blob-URL
 * approach instead.
 *
 * Revokes the previous object URL whenever `url` changes or the component
 * unmounts, to avoid leaking blob URLs.
 */
export function useAuthedImageUrl(url: string | null | undefined): {
  objectUrl: string | null;
  loading: boolean;
  error: string | null;
} {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setObjectUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let currentObjectUrl: string | null = null;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        currentObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(currentObjectUrl);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [url]);

  return { objectUrl, loading, error };
}
