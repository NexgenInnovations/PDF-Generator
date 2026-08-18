import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Form, Viewer } from '@pdfme/ui';
import { getInputFromTemplate, isBlankPdf, type Template } from '@pdfme/common';
import { pdf2size } from '@pdfme/converter';
import { ArrowLeft, Download, FileCheck, Loader2, AlertCircle, PenLine, X } from 'lucide-react';
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

function getPageSizeMm(
  template: Template,
  pageIndex: number,
  customPdfPageSizes: { width: number; height: number }[] | null
): { width: number; height: number } {
  const basePdf = template.basePdf;
  if (isBlankPdf(basePdf)) {
    return { width: basePdf.width, height: basePdf.height };
  }
  if (customPdfPageSizes && customPdfPageSizes[pageIndex]) {
    return customPdfPageSizes[pageIndex];
  }
  return { width: 210, height: 297 }; // A4 fallback while real custom-PDF page sizes are still loading (or failed to load)
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
  const [placementMode, setPlacementMode] = useState(false);
  const [signAnywhereFieldName, setSignAnywhereFieldName] = useState<string | null>(null);
  const [customPdfPageSizes, setCustomPdfPageSizes] = useState<{ width: number; height: number }[] | null>(null);
  const [loadingPageSizes, setLoadingPageSizes] = useState(false);

  const versionParam = searchParams.get('version');
  const tagParam = searchParams.get('tag');
  const versionRef: PublishedVersionRef | undefined = versionParam
    ? { version: Number(versionParam) }
    : tagParam
      ? { tag: tagParam }
      : undefined;

  useEffect(() => {
    if (!id) return;
    api.getPublicTemplate(id, versionRef)
      .then(async (record) => {
        const schema = record.latestPublished?.schema;
        if (!schema) { setError('No published version available for this template.'); return; }
        const template = schema as Template;
        setTemplateRecord({ name: record.name, schema: template });

        setCustomPdfPageSizes(null);
        const basePdf = template.basePdf;
        if (!isBlankPdf(basePdf) && typeof basePdf === 'string') {
          setLoadingPageSizes(true);
          try {
            const base64Payload = basePdf.split(',')[1] ?? basePdf;
            const bytes = Uint8Array.from(atob(base64Payload), c => c.charCodeAt(0));
            const sizes = await pdf2size(bytes);
            setCustomPdfPageSizes(sizes);
          } catch (e) {
            console.error('Failed to determine custom PDF page sizes, falling back to A4:', e);
          } finally {
            setLoadingPageSizes(false);
          }
        }
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
    setSignAnywhereFieldName(null);
    setPlacementMode(false);
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
  const allSignerDetailsFilled =
    signatureFields.every(
      f => signerDetails[f.name]?.name?.trim() && signerDetails[f.name]?.email?.trim()
    ) &&
    (!signAnywhereFieldName ||
      Boolean(signerDetails[signAnywhereFieldName]?.name?.trim() && signerDetails[signAnywhereFieldName]?.email?.trim()));

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

      let signAnywherePayload: { page: number; x: number; y: number; content: string; signerName: string; signerEmail: string } | undefined;
      if (signAnywhereFieldName) {
        const content = inputs[0]?.[signAnywhereFieldName];
        if (typeof content !== 'string' || content.trim().length === 0) {
          setError('Please draw your signature in the field you placed before submitting.');
          setSubmitting(false);
          return;
        }
        const currentTemplate = (uiRef.current as Form).getTemplate();
        let foundPage = -1;
        let foundSchema: { position: { x: number; y: number } } | undefined;
        currentTemplate.schemas.forEach((page, pageIndex) => {
          const match = page.find(schema => schema.name === signAnywhereFieldName);
          if (match) {
            foundPage = pageIndex;
            foundSchema = match;
          }
        });
        if (foundPage === -1 || !foundSchema) {
          setError('The placed signature could not be found. Please remove and re-place it.');
          setSubmitting(false);
          return;
        }
        const details = signerDetails[signAnywhereFieldName];
        if (!details?.name?.trim() || !details?.email?.trim()) {
          setError('Please fill in the signer details for the signature you placed before submitting.');
          setSubmitting(false);
          return;
        }
        signAnywherePayload = {
          page: foundPage,
          x: foundSchema.position.x,
          y: foundSchema.position.y,
          content,
          signerName: details.name.trim(),
          signerEmail: details.email.trim(),
        };
      }

      const template = templateRecord.schema;
      const pdfBytes = await api.createFilledPdf(id, inputs, versionRef, signatureEvents, signAnywherePayload);
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

  const handlePlacementClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placementMode || !uiRef.current || !templateRecord || !containerRef.current) return;

    const pageEls = containerRef.current.querySelectorAll<HTMLElement>('div[style*="background-image"]');
    let targetPageIndex = -1;
    let pageRect: DOMRect | null = null;
    for (let i = 0; i < pageEls.length; i++) {
      const rect = pageEls[i].getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom && event.clientX >= rect.left && event.clientX <= rect.right) {
        targetPageIndex = i;
        pageRect = rect;
        break;
      }
    }
    if (targetPageIndex === -1 || !pageRect) return;

    const { width: pageWidthMm, height: pageHeightMm } = getPageSizeMm(templateRecord.schema, targetPageIndex, customPdfPageSizes);
    const pxPerMm = pageRect.width / pageWidthMm;
    const rawMmX = (event.clientX - pageRect.left) / pxPerMm;
    const rawMmY = (event.clientY - pageRect.top) / pxPerMm;
    const SIGN_ANYWHERE_WIDTH_MM = 62.5;
    const SIGN_ANYWHERE_HEIGHT_MM = 37.5;
    const mmX = Math.min(Math.max(rawMmX, 0), Math.max(0, pageWidthMm - SIGN_ANYWHERE_WIDTH_MM));
    const mmY = Math.min(Math.max(rawMmY, 0), Math.max(0, pageHeightMm - SIGN_ANYWHERE_HEIGHT_MM));

    const fieldName = `sign_anywhere_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const t = uiRef.current.getTemplate();
    const schemas = t.schemas.map((page, i) =>
      i === targetPageIndex
        ? [...page, { name: fieldName, type: 'signature', content: '', position: { x: mmX, y: mmY }, width: SIGN_ANYWHERE_WIDTH_MM, height: SIGN_ANYWHERE_HEIGHT_MM }]
        : page
    );
    uiRef.current.updateTemplate({ ...t, schemas });
    setSignerDetails(prev => ({ ...prev, [fieldName]: prev[fieldName] ?? { name: '', email: '' } }));
    setSignAnywhereFieldName(fieldName);
    setPlacementMode(false);
  };

  const handleRemoveSignAnywhere = () => {
    if (!uiRef.current || !signAnywhereFieldName) return;
    const t = uiRef.current.getTemplate();
    const schemas = t.schemas.map(page => page.filter(schema => schema.name !== signAnywhereFieldName));
    uiRef.current.updateTemplate({ ...t, schemas });
    setSignAnywhereFieldName(null);
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
            <span className="inline-flex items-center gap-1"><FileCheck className="h-3 w-3" />Submitted</span>
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
            onClick={() => {
              if (signAnywhereFieldName) {
                handleRemoveSignAnywhere();
              } else {
                setPlacementMode(prev => !prev);
              }
            }}
            disabled={!signAnywhereFieldName && loadingPageSizes}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
            style={{
              borderRadius: 50,
              border: '1px solid #e6e6e6',
              background: placementMode ? '#000' : 'transparent',
              color: placementMode ? '#fff' : 'rgba(0,0,0,0.55)',
            }}
          >
            {signAnywhereFieldName ? (
              <><X className="h-3.5 w-3.5" />Remove Signature</>
            ) : loadingPageSizes ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading page info…</>
            ) : placementMode ? (
              <><PenLine className="h-3.5 w-3.5" />Click page to sign…</>
            ) : (
              <><PenLine className="h-3.5 w-3.5" />Sign Document</>
            )}
          </button>
        )}

        {pageState === 'filling' && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !allSignerDetailsFilled}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-black/80 disabled:opacity-50 transition-all active:scale-[0.97]"
            style={{ borderRadius: 50 }}
          >
            {submitting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Submitting…</>
            ) : 'Submit'}
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

      {pageState === 'preview' && (
        <div
          className="flex items-center gap-2 text-sm"
          style={{ padding: '10px 16px', background: '#f0faf2', borderBottom: '1px solid #e6e6e6', color: '#1ea64a' }}
        >
          <FileCheck className="h-4 w-4 shrink-0" />
          Your submission was received. You can download your own copy below.
        </div>
      )}

      {pageState === 'filling' && (signatureFields.length > 0 || signAnywhereFieldName) && (
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
          {signAnywhereFieldName && (
            <SignerDetailsPanel
              key={signAnywhereFieldName}
              fieldLabel={signAnywhereFieldName}
              name={signerDetails[signAnywhereFieldName]?.name ?? ''}
              email={signerDetails[signAnywhereFieldName]?.email ?? ''}
              onNameChange={value => setSignerDetails(prev => ({ ...prev, [signAnywhereFieldName]: { ...prev[signAnywhereFieldName], name: value } }))}
              onEmailChange={value => setSignerDetails(prev => ({ ...prev, [signAnywhereFieldName]: { ...prev[signAnywhereFieldName], email: value } }))}
            />
          )}
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        <div
          ref={containerRef}
          className="h-full w-full overflow-auto"
          onClickCapture={placementMode ? handlePlacementClick : undefined}
          style={placementMode ? { cursor: 'crosshair', boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.15)' } : undefined}
        />
      </div>
    </div>
  );
}
