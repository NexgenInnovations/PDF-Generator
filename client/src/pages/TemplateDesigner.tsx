import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Designer } from '@pdfme/ui';
import { type Template } from '@pdfme/common';
import { AlertCircle, ArrowLeft, Save, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';
import { Input } from '../components/ui/input.js';

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
        options: { font: getFonts(), lang: 'en' },
        plugins: getPlugins(),
      });
    };

    init().catch((e: Error) => setError(e.message));

    return () => {
      mounted = false;
      const d = designerRef.current;
      designerRef.current = null;
      setTimeout(() => d?.destroy(), 0);
    };
  }, [id]);

  const handleSave = async () => {
    if (!designerRef.current) return;
    if (!name.trim()) { setError('Template name is required'); return; }
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
    <div className="flex flex-col" style={{ height: '100vh', background: '#000' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{
          background: 'rgba(0,0,0,0.90)',
          borderBottom: '1px solid rgba(0,207,255,0.12)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#A0B4CC] hover:text-[#00CFFF] hover:bg-[rgba(0,207,255,0.08)] transition-all"
          style={{ border: '1px solid rgba(0,207,255,0.12)' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="h-5 w-px" style={{ background: 'rgba(0,207,255,0.15)' }} />

        <Input
          type="text"
          placeholder="Template name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-64 h-8 text-sm"
        />

        {error && (
          <div className="flex items-center gap-1.5 text-red-400 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={() => navigate('/')}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#A0B4CC] hover:text-white transition-colors"
          style={{ border: '1px solid rgba(0,207,255,0.15)' }}
        >
          Cancel
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-all hover:brightness-110 active:scale-[0.97]"
          style={{
            background: 'linear-gradient(135deg, #0057FF, #00CFFF)',
            boxShadow: '0 0 14px rgba(0,207,255,0.35)',
          }}
        >
          {saving ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
          ) : (
            <><Save className="h-3.5 w-3.5" />Save</>
          )}
        </button>
      </div>

      {/* Designer canvas */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
