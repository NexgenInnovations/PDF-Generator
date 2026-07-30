import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, AlertCircle, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import type { LetterheadSummary } from '../types.js';
import type { Schema } from '@pdfme/common';
import HeaderFooterEditor from '../components/HeaderFooterEditor.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';

type PageSizeName = 'A4' | 'Letter' | 'Legal';

const PAGE_SIZES_PORTRAIT_MM: Record<PageSizeName, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export default function Letterheads() {
  const [letterheads, setLetterheads] = useState<LetterheadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageSizePickerOpen, setPageSizePickerOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<PageSizeName>('A4');
  const [editorState, setEditorState] = useState<{
    id: string | null;
    name: string;
    basePdf: { width: number; height: number; padding: [number, number, number, number]; staticSchema?: Schema[] };
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => {
    setLoading(true);
    api.listLetterheads()
      .then(setLetterheads)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const startCreate = () => setPageSizePickerOpen(true);

  const confirmCreateSize = () => {
    const size = PAGE_SIZES_PORTRAIT_MM[selectedSize];
    setPageSizePickerOpen(false);
    setEditorState({
      id: null,
      name: 'New Letterhead',
      basePdf: { width: size.width, height: size.height, padding: [10, 10, 10, 10] },
    });
  };

  const handleImportClick = () => pdfFileInputRef.current?.click();

  const handlePdfFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const name = window.prompt('Name this letterhead', file.name.replace(/\.pdf$/i, ''));
    if (!name || name.trim().length === 0) return;

    setImporting(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const basePdf = reader.result as string;
        await api.createLetterhead({ name: name.trim(), type: 'pdf', basePdf });
        refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setError('Could not read the selected file.');
      setImporting(false);
    };
    reader.readAsDataURL(file);
  };

  const startEdit = async (summary: LetterheadSummary) => {
    try {
      const full = await api.getLetterhead(summary.id);
      setEditorState({
        id: full.id,
        name: full.name,
        basePdf: {
          width: full.page_width ?? PAGE_SIZES_PORTRAIT_MM.A4.width,
          height: full.page_height ?? PAGE_SIZES_PORTRAIT_MM.A4.height,
          padding: [10, 10, 10, 10],
          staticSchema: full.static_schema as Schema[],
        },
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEditorSave = async (staticSchema: Schema[]) => {
    if (!editorState) return;
    try {
      if (editorState.id) {
        await api.updateLetterhead(editorState.id, { staticSchema });
      } else {
        await api.createLetterhead({
          name: editorState.name,
          type: 'fields',
          staticSchema,
          pageWidth: editorState.basePdf.width,
          pageHeight: editorState.basePdf.height,
        });
      }
      setEditorState(null);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRename = async (id: string, currentName: string) => {
    const nextName = window.prompt('Rename letterhead', currentName);
    if (!nextName || nextName.trim().length === 0 || nextName === currentName) return;
    try {
      await api.updateLetterhead(id, { name: nextName.trim() });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteLetterhead(id);
      setLetterheads(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AppLayout>
      <TopBar title="Letterheads" />
      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm" style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            {letterheads.length} letterhead{letterheads.length === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={startCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Letterhead
            </Button>
            <Button onClick={handleImportClick} disabled={importing} variant="outline">
              <Upload className="h-4 w-4 mr-1.5" />
              {importing ? 'Importing…' : 'Import PDF'}
            </Button>
            <input
              ref={pdfFileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handlePdfFileSelected}
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>Loading…</p>
        ) : letterheads.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>No letterheads yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {letterheads.map(lh => (
              <Card key={lh.id} className="p-3 space-y-2">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--nx-ink)' }} title={lh.name}>
                  {lh.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>
                  {lh.type === 'pdf' ? 'Imported PDF' : `${lh.page_width}×${lh.page_height}mm`}
                </p>
                <div className="flex items-center gap-3">
                  {lh.type === 'fields' && (
                    <button
                      onClick={() => startEdit(lh)}
                      className="flex items-center gap-1 text-xs"
                      style={{ color: 'var(--nx-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => handleRename(lh.id, lh.name)}
                    className="text-xs"
                    style={{ color: 'var(--nx-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDelete(lh.id)}
                    className="flex items-center gap-1 text-xs"
                    style={{ color: 'var(--nx-destructive)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {pageSizePickerOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.40)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setPageSizePickerOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '360px',
              background: '#fff',
              border: '1px solid #e6e6e6',
              borderRadius: 16,
              padding: 16,
              display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
            }}
          >
            <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Page size</span>
            <select
              value={selectedSize}
              onChange={e => setSelectedSize(e.target.value as PageSizeName)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13 }}
            >
              {(Object.keys(PAGE_SIZES_PORTRAIT_MM) as PageSizeName[]).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setPageSizePickerOpen(false)}
                style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid #e6e6e6', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmCreateSize}
                style={{ padding: '6px 16px', borderRadius: 50, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {editorState && (
        <HeaderFooterEditor
          basePdf={editorState.basePdf}
          onSave={handleEditorSave}
          onClose={() => setEditorState(null)}
        />
      )}
    </AppLayout>
  );
}
