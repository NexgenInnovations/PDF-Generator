// client/src/components/AssetPicker.tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import type { AssetRecord } from '../types.js';

async function fetchAssetAsDataUrl(id: string): Promise<string> {
  const res = await fetch(api.assetFileUrl(id));
  if (!res.ok) throw new Error(`Failed to fetch asset: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchAssetAsText(id: string): Promise<string> {
  const res = await fetch(api.assetFileUrl(id));
  if (!res.ok) throw new Error(`Failed to fetch asset: ${res.status}`);
  return res.text();
}

export default function AssetPicker(props: {
  onSelect: (content: string, mimeType: string) => void;
  onClose: () => void;
}) {
  const { onSelect, onClose } = props;
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    api.listAssets()
      .then(setAssets)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handlePick = async (asset: AssetRecord) => {
    setSelectingId(asset.id);
    setError(null);
    try {
      const content = asset.mime_type === 'image/svg+xml'
        ? await fetchAssetAsText(asset.id)
        : await fetchAssetAsDataUrl(asset.id);
      onSelect(content, asset.mime_type);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '640px', maxWidth: '90vw', maxHeight: '80vh',
          background: '#fff',
          border: '1px solid #e6e6e6',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Pick from Assets</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, overflow: 'auto' }}>
          {error && (
            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          {loading ? (
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>Loading…</div>
          ) : assets.length === 0 ? (
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>
              No assets uploaded yet. Upload one from the Assets page first.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {assets.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => handlePick(asset)}
                  disabled={selectingId !== null}
                  style={{
                    border: '1px solid #e6e6e6', borderRadius: 12, padding: 8,
                    background: 'transparent', cursor: selectingId ? 'wait' : 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
                    opacity: selectingId && selectingId !== asset.id ? 0.5 : 1,
                  }}
                >
                  <div style={{
                    width: '100%', aspectRatio: '1 / 1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#f7f7f5', borderRadius: 8, overflow: 'hidden',
                  }}>
                    <img
                      src={api.assetFileUrl(asset.id)}
                      alt={asset.name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.70)', textAlign: 'center', wordBreak: 'break-word' }}>
                    {selectingId === asset.id ? 'Loading…' : asset.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
