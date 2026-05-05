import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Designer } from '@pdfme/ui';
import { type Template } from '@pdfme/common';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';

const BLANK_TEMPLATE: Template = {
  basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
  schemas: [[]],
};

export default function TemplateDesigner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const designerRef = useRef<Designer | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!containerRef.current) return;

      let template: Template = BLANK_TEMPLATE;

      if (id) {
        const record = await api.getTemplate(id);
        template = record.schema as Template;
        if (mounted) setName(record.name);
      }

      if (!mounted || !containerRef.current) return;

      designerRef.current = new Designer({
        domContainer: containerRef.current,
        template,
        options: {
          font: getFonts(),
          lang: 'en',
        },
        plugins: getPlugins(),
      });
    };

    init().catch((e: Error) => setError(e.message));

    return () => {
      mounted = false;
      designerRef.current?.destroy();
      designerRef.current = null;
    };
  }, [id]);

  const handleSave = async () => {
    if (!designerRef.current) return;
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const schema = designerRef.current.getTemplate();
      if (id) {
        await api.updateTemplate(id, name.trim(), schema);
      } else {
        await api.createTemplate(name.trim(), schema);
      }
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 57px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <input
          type="text"
          placeholder="Template name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, maxWidth: 320, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
        />
        {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
        <button
          onClick={() => navigate('/')}
          style={{ padding: '6px 12px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  );
}
