import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Form, Viewer } from '@pdfme/ui';
import { generate } from '@pdfme/generator';
import { getInputFromTemplate, type Template } from '@pdfme/common';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';

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
    api.getTemplate(id).then((record) => {
      setTemplateRecord({ name: record.name, schema: record.schema as Template });
    }).catch((e: Error) => setError(e.message));
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
      uiRef.current?.destroy();
      uiRef.current = null;
    };
  }, [templateRecord]);

  const handleSubmit = async () => {
    if (!uiRef.current || !templateRecord || !id) return;

    setSubmitting(true);
    setError(null);

    try {
      const inputs = (uiRef.current as Form).getInputs();
      const template = templateRecord.schema;

      const pdfBytes = await generate({
        template,
        inputs,
        options: { font: getFonts() },
        plugins: getPlugins(),
      });

      const blob = new Blob([pdfBytes.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

      uiRef.current.destroy();
      uiRef.current = null;

      if (containerRef.current) {
        uiRef.current = new Viewer({
          domContainer: containerRef.current,
          template,
          inputs,
          options: { font: getFonts(), lang: 'en' },
          plugins: getPlugins(),
        });
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 57px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{templateRecord?.name ?? 'Loading…'}</span>
        {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/')}
          style={{ padding: '6px 12px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Back
        </button>
        {pageState === 'filling' && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: '6px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            {submitting ? 'Generating…' : 'Generate PDF'}
          </button>
        )}
        {pageState === 'preview' && (
          <button
            onClick={handleDownload}
            style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            Download PDF
          </button>
        )}
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  );
}
