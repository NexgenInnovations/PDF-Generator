// client/src/components/LetterheadPicker.tsx
import { useEffect, useState } from 'react';
import type { Schema } from '@pdfme/common';
import { api } from '../lib/api.js';
import type { LetterheadSummary } from '../types.js';

export default function LetterheadPicker(props: {
  onSelect: (staticSchema: Schema[]) => void;
  onClose: () => void;
}) {
  const { onSelect, onClose } = props;
  const [letterheads, setLetterheads] = useState<LetterheadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    api.listLetterheads()
      .then(setLetterheads)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handlePick = async (letterhead: LetterheadSummary) => {
    setSelectingId(letterhead.id);
    setError(null);
    try {
      const full = await api.getLetterhead(letterhead.id);
      onSelect(full.static_schema as Schema[]);
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
          width: '480px', maxWidth: '90vw', maxHeight: '80vh',
          background: '#fff',
          border: '1px solid #e6e6e6',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Apply Letterhead</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, overflow: 'auto' }}>
          {error && (
            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          {loading ? (
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>Loading…</div>
          ) : letterheads.length === 0 ? (
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>
              No letterheads yet. Create one from the Letterheads page first.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {letterheads.map(lh => (
                <button
                  key={lh.id}
                  onClick={() => handlePick(lh)}
                  disabled={selectingId !== null}
                  style={{
                    textAlign: 'left', padding: '10px 14px', borderRadius: 10,
                    border: '1px solid #e6e6e6', background: 'transparent',
                    cursor: selectingId ? 'wait' : 'pointer',
                    opacity: selectingId && selectingId !== lh.id ? 0.5 : 1,
                  }}
                >
                  <div style={{ color: '#000', fontWeight: 600, fontSize: 13 }}>
                    {selectingId === lh.id ? 'Loading…' : lh.name}
                  </div>
                  <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 11 }}>
                    {lh.page_width}×{lh.page_height}mm
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
