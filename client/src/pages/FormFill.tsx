import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Form, Viewer } from '@pdfme/ui';
import { getInputFromTemplate, type Template } from '@pdfme/common';
import { ArrowLeft, Download, FileCheck, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';
import type { PublishedVersionRef } from '../lib/api.js';
import SignerDetailsPanel from '../components/SignerDetailsPanel.js';

type PageState = 'filling' | 'preview';

function getSignatureFields(template: Template): { name: string }[] {
  return template.schemas
    .flat()
    .filter(schema => schema.type === 'signature')
    .map(schema => ({ name: schema.name }));
}

export default function FormFill() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uiRef = useRef<Form | Viewer | null>(null);
  const [templateRecord, setTemplateRecord] = useState<{ name: string; schema: Template } | null>(null);
  const [pageState, setPageState] = useState<PageState>('filling');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signerDetails, setSignerDetails] = useState<Record<string, { name: string; email: string }>>({});

  const versionParam = searchParams.get('version');
  const tagParam = searchParams.get('tag');
  const versionRef: PublishedVersionRef | undefined = versionParam
    ? { version: Number(versionParam) }
    : tagParam
      ? { tag: tagParam }
      : undefined;

  useEffect(() => {
    if (!id) return;
    api.getTemplate(id, versionRef)
      .then((record) => {
        const schema = record.latestPublished?.schema;
        if (!schema) { setError('No published version available for this template.'); return; }
        setTemplateRecord({ name: record.name, schema: schema as Template });
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, versionParam, tagParam]);

  useEffect(() => {
    if (!templateRecord) return;
    const fields = getSignatureFields(templateRecord.schema);
    setSignerDetails(prev => {
      const next: Record<string, { name: string; email: string }> = {};
      for (const f of fields) {
        next[f.name] = prev[f.name] ?? { name: '', email: '' };
      }
      return next;
    });
  }, [templateRecord]);

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

  const signatureFields = templateRecord ? getSignatureFields(templateRecord.schema) : [];
  const allSignerDetailsFilled = signatureFields.every(
    f => signerDetails[f.name]?.name.trim() && signerDetails[f.name]?.email.trim()
  );

  const handleSubmit = async () => {
    if (!uiRef.current || !templateRecord || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      const inputs = (uiRef.current as Form).getInputs();

      if (!allSignerDetailsFilled) {
        setError('Please fill in the signer details for every signature field before submitting.');
        setSubmitting(false);
        return;
      }

      const allSignaturesDrawn = signatureFields.every(
        f => typeof inputs[0]?.[f.name] === 'string' && inputs[0][f.name].trim().length > 0
      );
      if (!allSignaturesDrawn) {
        setError('Please draw your signature in every signature field before submitting.');
        setSubmitting(false);
        return;
      }

      const signatureEvents = signatureFields.map(f => ({
        fieldName: f.name,
        signerName: signerDetails[f.name].name.trim(),
        signerEmail: signerDetails[f.name].email.trim(),
      }));

      const template = templateRecord.schema;
      const pdfBytes = await api.createFilledPdf(id, inputs, versionRef, signatureEvents);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      uiRef.current.destroy();
      uiRef.current = null;
      if (containerRef.current) {
        uiRef.current = new Viewer({ domContainer: containerRef.current, template, inputs, options: { font: getFonts(), lang: 'en' }, plugins: getPlugins() });
      }
      setPageState('preview');
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
    <div className="flex flex-col" style={{ height: '100vh', background: '#f7f7f5' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0 bg-white"
        style={{ borderBottom: '1px solid #e6e6e6' }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-black/40 hover:text-black hover:bg-[#f7f7f5] transition-all"
          style={{ border: '1px solid #e6e6e6' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="h-5 w-px" style={{ background: '#e6e6e6' }} />

        <span className="font-semibold text-sm text-black truncate max-w-xs">
          {templateRecord?.name ?? 'Loading…'}
        </span>

        <span
          className="px-2.5 py-0.5 text-[10px] font-semibold"
          style={{
            borderRadius: 50,
            background: pageState === 'preview' ? '#c8e6cd' : '#f7f7f5',
            color: pageState === 'preview' ? '#1ea64a' : 'rgba(0,0,0,0.50)',
            border: '1px solid #e6e6e6',
          }}
        >
          {pageState === 'preview' ? (
            <span className="inline-flex items-center gap-1"><FileCheck className="h-3 w-3" />Generated</span>
          ) : 'Filling'}
        </span>

        {error && (
          <div className="flex items-center gap-1.5 text-red-600 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={() => navigate('/')}
          className="px-3 py-1.5 text-xs font-semibold text-black/50 hover:text-black transition-colors"
          style={{ borderRadius: 50, border: '1px solid #e6e6e6' }}
        >
          Back
        </button>

        {pageState === 'filling' && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !allSignerDetailsFilled}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-black/80 disabled:opacity-50 transition-all active:scale-[0.97]"
            style={{ borderRadius: 50 }}
          >
            {submitting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
            ) : 'Generate PDF'}
          </button>
        )}

        {pageState === 'preview' && (
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-black/80 transition-all active:scale-[0.97]"
            style={{ borderRadius: 50 }}
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        )}
      </div>

      {pageState === 'filling' && signatureFields.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#f7f7f5', borderBottom: '1px solid #e6e6e6' }}>
          {signatureFields.map(f => (
            <SignerDetailsPanel
              key={f.name}
              fieldLabel={f.name}
              name={signerDetails[f.name]?.name ?? ''}
              email={signerDetails[f.name]?.email ?? ''}
              onNameChange={value => setSignerDetails(prev => ({ ...prev, [f.name]: { ...prev[f.name], name: value } }))}
              onEmailChange={value => setSignerDetails(prev => ({ ...prev, [f.name]: { ...prev[f.name], email: value } }))}
            />
          ))}
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
