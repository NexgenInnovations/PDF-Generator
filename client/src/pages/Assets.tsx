import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { AssetRecord } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';

export default function Assets() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => {
    setLoading(true);
    api.listAssets()
      .then(setAssets)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      await api.uploadAsset(file, file.name);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAsset(id);
      setAssets(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AppLayout>
      <TopBar title="Assets" />
      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm" style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            {assets.length} asset{assets.length === 1 ? '' : 's'}
          </p>
          <Button onClick={handleUploadClick} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1.5" />
            {uploading ? 'Uploading…' : 'Upload asset'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>Loading…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>No assets uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {assets.map(asset => (
              <Card key={asset.id} className="p-3 space-y-2">
                <div
                  className="flex items-center justify-center rounded-[var(--nx-radius-sm)] overflow-hidden"
                  style={{ background: 'var(--nx-surface)', aspectRatio: '1 / 1' }}
                >
                  <img
                    src={api.assetFileUrl(asset.id)}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <p className="text-xs font-medium truncate" style={{ color: 'var(--nx-ink)' }} title={asset.name}>
                  {asset.name}
                </p>
                <button
                  onClick={() => handleDelete(asset.id)}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: 'var(--nx-destructive)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
