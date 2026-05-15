import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Form, Viewer } from '@pdfme/ui';
import { generate } from '@pdfme/generator';
import { getInputFromTemplate, type Template } from '@pdfme/common';
import { ArrowLeft, Download, FileCheck, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';
import { Badge } from '../components/ui/badge.js';

type PageState = 'filling' | 'preview';

export default function FormFill() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uiRef = useRef<Form | Viewer | null>(null);
  const [templateRecord, setTemplateRecord] = useState<{ name: string; schema: Template } | null>(null);
  const [pageState, setPageState] = useState<PageState>('filling');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getTemplate(id)
      .then((record) => setTemplateRecord({ name: record.name, schema: record.schema as Template }))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!templateRecord || !containerRef.current) return;
    uiRef.current?.destroy();
    uiRef.current = null;
    const template = templateRecord.schema;
    const inputs = getInputFromTemplate(template);
    uiRef.current = new Form({
      domContainer: containerRef.current,
      template,
      inputs,
      options: { font: getFonts(), lang: 'en' },
      plugins: getPlugins(),
    });
    return () => {
      const ui = uiRef.current;
      uiRef.current = null;
      setTimeout(() => ui?.destroy(), 0);
    };
  }, [templateRecord]);

  const handleSubmit = async () => {
    if (!uiRef.current || !templateRecord || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      const inputs = (uiRef.current as Form).getInputs();
      const template = templateRecord.schema;
      const pdfBytes = await generate({ template, inputs, options: { font: getFonts() }, plugins: getPlugins() });
      const blob = new Blob([pdfBytes.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      uiRef.current.destroy();
      uiRef.current = null;
      if (containerRef.current) {
        uiRef.current = new Viewer({ domContainer: containerRef.current, template, inputs, options: { font: getFonts(), lang: 'en' }, plugins: getPlugins() });
      }
      setPageState('preview');
      await api.createFilledPdf(id, inputs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl || !templateRecord) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${templateRecord.name}.pdf`;
    a.click();
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

        <span className="font-semibold text-sm text-white truncate max-w-xs">
          {templateRecord?.name ?? 'Loading…'}
        </span>

        <Badge variant={pageState === 'preview' ? 'success' : 'secondary'} className="text-[10px]">
          {pageState === 'preview' ? (
            <><FileCheck className="h-3 w-3 mr-1 inline" />Generated</>
          ) : 'Filling'}
        </Badge>

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
          Back
        </button>

        {pageState === 'filling' && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #0057FF, #00CFFF)', boxShadow: '0 0 14px rgba(0,207,255,0.35)' }}
          >
            {submitting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
            ) : 'Generate PDF'}
          </button>
        )}

        {pageState === 'preview' && (
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #0057FF, #00CFFF)', boxShadow: '0 0 14px rgba(0,207,255,0.35)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        )}
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
