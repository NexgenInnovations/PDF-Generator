import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Designer } from '@pdfme/ui';
import { generate } from '@pdfme/generator';
import { checkTemplate, getInputFromTemplate, isBlankPdf, type Template } from '@pdfme/common';
import {
  AlertCircle, ArrowLeft, Save, Loader2,
  FileJson, FileDown, RotateCcw, Copy, FileUp, Layout, Sparkles, Printer,
  RectangleVertical, RectangleHorizontal, PanelTop, Code, UploadCloud,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';
import { Input } from '../components/ui/input.js';
import AskAiPanel from '../components/AskAiPanel.js';
import HeaderFooterEditor from '../components/HeaderFooterEditor.js';
import ApiPayloadModal from '../components/ApiPayloadModal.js';
import { detectFields } from '../lib/pdfFieldDetection.js';
import { detectFieldsWithAiVision } from '../lib/aiPdfVisionDetection.js';

const BLANK_TEMPLATE: Template = {
  basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
  schemas: [[]],
};

type PageSizeName = 'A4' | 'Letter' | 'Legal';

const PAGE_SIZES_PORTRAIT_MM: Record<PageSizeName, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

function matchPageSizeName(width: number, height: number): PageSizeName | null {
  const w = Math.min(width, height);
  const h = Math.max(width, height);
  for (const name of Object.keys(PAGE_SIZES_PORTRAIT_MM) as PageSizeName[]) {
    const size = PAGE_SIZES_PORTRAIT_MM[name];
    if (Math.abs(size.width - w) < 0.1 && Math.abs(size.height - h) < 0.1) {
      return name;
    }
  }
  return null;
}

function ToolbarBtn({
  icon, label, onClick, accent, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      style={accent ? {
        background: '#000',
        color: '#fff',
        borderRadius: 50,
        border: 'none',
      } : {
        background: 'transparent',
        color: 'rgba(0,0,0,0.55)',
        borderRadius: 50,
        border: '1px solid #e6e6e6',
      }}
      onMouseEnter={e => {
        if (!accent) {
          (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f5';
          (e.currentTarget as HTMLButtonElement).style.color = '#000';
        }
      }}
      onMouseLeave={e => {
        if (!accent) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,0,0,0.55)';
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 20, background: '#e6e6e6', flexShrink: 0 }} />;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 9,
        fontWeight: 400,
        letterSpacing: '0.10em',
        color: 'rgba(0,0,0,0.35)',
        textTransform: 'uppercase',
        fontFamily: "'Geist Mono', monospace",
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function PublishModal({
  publishedVersions, publishing, onPublish, onClose,
}: {
  publishedVersions: { version: number; tag: string | null; created_at: string }[];
  publishing: boolean;
  onPublish: (tag: string, target: { mode: 'new' } | { mode: 'replace'; version: number }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [tag, setTag] = useState(publishedVersions.length === 0 ? 'v1' : '');
  const [replaceVersion, setReplaceVersion] = useState<number | null>(publishedVersions[0]?.version ?? null);

  const handleReplaceVersionChange = (version: number) => {
    setReplaceVersion(version);
    const existing = publishedVersions.find(v => v.version === version);
    setTag(existing?.tag ?? '');
  };

  const handleModeChange = (newMode: 'new' | 'replace') => {
    setMode(newMode);
    if (newMode === 'replace' && replaceVersion !== null) {
      const existing = publishedVersions.find(v => v.version === replaceVersion);
      setTag(existing?.tag ?? '');
    } else if (newMode === 'new') {
      setTag(publishedVersions.length === 0 ? 'v1' : '');
    }
  };

  const canSubmit = tag.trim().length > 0 && (mode === 'new' || replaceVersion !== null);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '480px',
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Publish template</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => handleModeChange('new')}
              style={{
                padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: mode === 'new' ? 'none' : '1px solid #e6e6e6',
                background: mode === 'new' ? '#000' : 'transparent',
                color: mode === 'new' ? '#fff' : 'rgba(0,0,0,0.55)',
              }}
            >
              New version
            </button>
            <button
              onClick={() => handleModeChange('replace')}
              disabled={publishedVersions.length === 0}
              style={{
                padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: mode === 'replace' ? 'none' : '1px solid #e6e6e6',
                background: mode === 'replace' ? '#000' : 'transparent',
                color: mode === 'replace' ? '#fff' : 'rgba(0,0,0,0.55)',
                opacity: publishedVersions.length === 0 ? 0.4 : 1,
              }}
            >
              Replace existing
            </button>
          </div>

          {mode === 'replace' && (
            <select
              value={replaceVersion ?? ''}
              onChange={e => handleReplaceVersionChange(Number(e.target.value))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13 }}
            >
              {publishedVersions.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version} — {v.tag} ({new Date(v.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', display: 'block', marginBottom: 4 }}>
              Tag
            </label>
            <input
              type="text"
              value={tag}
              onChange={e => setTag(e.target.value)}
              placeholder="e.g. v1.2 - added tax field"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #e6e6e6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid #e6e6e6', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onPublish(tag.trim(), mode === 'new' ? { mode: 'new' } : { mode: 'replace', version: replaceVersion! })}
            disabled={!canSubmit || publishing}
            style={{
              padding: '6px 16px', borderRadius: 50, border: 'none',
              background: '#000', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: canSubmit && !publishing ? 'pointer' : 'not-allowed',
              opacity: canSubmit && !publishing ? 1 : 0.5,
            }}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplateDesigner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const designerRef = useRef<Designer | null>(null);
  const basePdfInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isDetectingAi, setIsDetectingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [headerFooterOpen, setHeaderFooterOpen] = useState(false);
  const [apiPayloadOpen, setApiPayloadOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishedVersions, setPublishedVersions] = useState<{ version: number; tag: string | null; created_at: string }[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [, setTemplateVersion] = useState(0);

  const currentBasePdf = designerRef.current?.getTemplate().basePdf;
  const isBlank = currentBasePdf ? isBlankPdf(currentBasePdf) : false;
  const currentSizeName = isBlank && currentBasePdf && typeof currentBasePdf === 'object' && 'width' in currentBasePdf
    ? matchPageSizeName((currentBasePdf as { width: number; height: number }).width, (currentBasePdf as { width: number; height: number }).height)
    : null;
  const currentOrientation = isBlank && currentBasePdf && typeof currentBasePdf === 'object' && 'width' in currentBasePdf
    ? ((currentBasePdf as { width: number; height: number }).width <= (currentBasePdf as { width: number; height: number }).height ? 'portrait' : 'landscape')
    : 'portrait';

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!containerRef.current) return;
      let template: Template = BLANK_TEMPLATE;
      if (id) {
        const record = await api.getTemplate(id);
        template = (record.draft?.schema ?? record.latestPublished?.schema ?? BLANK_TEMPLATE) as Template;
        if (mounted) setName(record.name);
      }
      if (!mounted || !containerRef.current) return;
      designerRef.current = new Designer({
        domContainer: containerRef.current,
        template,
        options: { font: getFonts(), lang: 'en' },
        plugins: getPlugins(),
      });
      setTemplateVersion(v => v + 1);
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
      navigate('/templates');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async () => {
    if (!designerRef.current) return;
    const newName = prompt('Save as — enter new template name:', name ? `${name} (copy)` : '');
    if (!newName?.trim()) return;
    try {
      const schema = designerRef.current.getTemplate();
      await api.createTemplate(newName.trim(), schema);
      navigate('/templates');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleOpenPublish = async () => {
    if (!id) { setError('Save the template before publishing.'); return; }
    try {
      const versions = await api.listPublishedVersions(id);
      setPublishedVersions(versions);
      setPublishOpen(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handlePublish = async (tag: string, target: { mode: 'new' } | { mode: 'replace'; version: number }) => {
    if (!designerRef.current || !id) return;
    setPublishing(true);
    setError(null);
    try {
      const schema = designerRef.current.getTemplate();
      await api.publishTemplate(id, schema, tag, target);
      setPublishOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const handleReset = () => {
    if (!designerRef.current) return;
    if (!confirm('Reset the canvas? All unsaved changes will be lost.')) return;
    designerRef.current.updateTemplate(BLANK_TEMPLATE);
    setTemplateVersion(v => v + 1);
  };

  const handleStaticSchema = () => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    const hasStatic = t.schemas.length > 1;
    if (hasStatic) {
      designerRef.current.updateTemplate({ ...t, schemas: [t.schemas[0]] });
    } else {
      designerRef.current.updateTemplate({ ...t, schemas: [...t.schemas, []] });
    }
  };

  const handleAiTemplateReady = (template: Template) => {
    if (!designerRef.current) return;
    try {
      checkTemplate(template);
    } catch (e) {
      setError(`AI generated an invalid template: ${(e as Error).message}`);
      return;
    }
    designerRef.current.updateTemplate(template);
    setAiOpen(false);
  };

  const handleHeaderFooterSave = (staticSchema: import('@pdfme/common').Schema[]) => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    if (!isBlankPdf(t.basePdf)) return;
    designerRef.current.updateTemplate({
      ...t,
      basePdf: { ...t.basePdf, staticSchema },
    });
    setTemplateVersion(v => v + 1);
    setHeaderFooterOpen(false);
  };

  const applyBasePdfPatch = (patch: { width: number; height: number }) => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    if (!isBlankPdf(t.basePdf)) return;
    const hasFields = t.schemas[0]?.length > 0;
    if (hasFields && !confirm('Changing the page size may move fields outside the page. Continue?')) {
      return;
    }
    designerRef.current.updateTemplate({
      ...t,
      basePdf: { ...t.basePdf, ...patch },
    });
    setTemplateVersion(v => v + 1);
  };

  const handlePageSizeChange = (sizeName: PageSizeName) => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    if (!isBlankPdf(t.basePdf)) return;
    const base = PAGE_SIZES_PORTRAIT_MM[sizeName];
    const landscape = t.basePdf.width > t.basePdf.height;
    applyBasePdfPatch(landscape
      ? { width: base.height, height: base.width }
      : { width: base.width, height: base.height });
  };

  const handleOrientationChange = (orientation: 'portrait' | 'landscape') => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    if (!isBlankPdf(t.basePdf)) return;
    const { width, height } = t.basePdf;
    const isLandscape = width > height;
    if ((orientation === 'landscape') === isLandscape) return;
    applyBasePdfPatch({ width: height, height: width });
  };

  const handleOpenJson = () => {
    if (!designerRef.current) return;
    setJsonText(JSON.stringify(designerRef.current.getTemplate(), null, 2));
    setJsonOpen(true);
  };

  const handleApplyJson = () => {
    if (!designerRef.current) return;
    try {
      const parsed = JSON.parse(jsonText) as Template;
      designerRef.current.updateTemplate(parsed);
      setJsonOpen(false);
    } catch {
      alert('Invalid JSON — please fix and try again.');
    }
  };

  const handleDownloadTemplateJson = () => {
    if (!designerRef.current) return;
    const blob = new Blob([JSON.stringify(designerRef.current.getTemplate(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'template'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGeneratePdf = async () => {
    if (!designerRef.current) return;
    setGenerating(true);
    setError(null);
    try {
      const template = designerRef.current.getTemplate();
      const inputs = getInputFromTemplate(template);
      const pdfBytes = await generate({
        template,
        inputs,
        options: { font: getFonts() },
        plugins: getPlugins(),
      });
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handleChangePdf = () => basePdfInputRef.current?.click();

  const handleBasePdfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !designerRef.current) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const t = designerRef.current!.getTemplate();

      let detectedSchemas: import('@pdfme/common').Schema[][] | null = null;
      let arrayBuffer: ArrayBuffer | null = null;
      try {
        arrayBuffer = await file.arrayBuffer();
        const schemas = await detectFields(arrayBuffer);
        const hasAnyFields = schemas.some(page => page.length > 0);
        if (hasAnyFields) detectedSchemas = schemas;
      } catch (err) {
        console.warn('PDF field detection failed, falling back to background-only update:', err);
      }

      if (detectedSchemas) {
        const candidate = { ...t, basePdf: dataUrl, schemas: detectedSchemas };
        try {
          checkTemplate(candidate);
          designerRef.current!.updateTemplate(candidate);
          setTemplateVersion(v => v + 1);
          e.target.value = '';
          return;
        } catch (err) {
          setError(`Detected fields could not be applied: ${(err as Error).message}`);
        }
      } else if (arrayBuffer) {
        setIsDetectingAi(true);
        try {
          const aiTemplate = await detectFieldsWithAiVision(arrayBuffer);
          if (aiTemplate) {
            try {
              checkTemplate(aiTemplate);
              designerRef.current!.updateTemplate(aiTemplate);
              setTemplateVersion(v => v + 1);
              e.target.value = '';
              return;
            } catch (err) {
              setError(`AI-generated template could not be applied: ${(err as Error).message}`);
            }
          } else {
            setError("Couldn't detect fields from this PDF automatically — the PDF has been set as the background.");
          }
        } finally {
          setIsDetectingAi(false);
        }
      }

      designerRef.current!.updateTemplate({ ...t, basePdf: dataUrl });
      setTemplateVersion(v => v + 1);
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const barStyle: React.CSSProperties = {
    background: '#ffffff',
    borderBottom: '1px solid #e6e6e6',
    flexShrink: 0,
  };

  return (
    <div className="flex flex-col" style={{ height: '100vh', background: '#f7f7f5' }}>

      {/* Row 1 — name / save */}
      <div className="flex items-center gap-3 px-4 py-2.5" style={barStyle}>
        <button
          onClick={() => navigate('/templates')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-black/50 hover:text-black hover:bg-[#f7f7f5] transition-all"
          style={{ border: '1px solid #e6e6e6' }}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="h-5 w-px" style={{ background: '#e6e6e6' }} />

        <Input
          type="text"
          placeholder="Template name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-64 h-8 text-sm bg-[#f7f7f5] border-[#e6e6e6] text-black placeholder:text-black/30 rounded-[50px]"
        />

        {error && (
          <div className="flex items-center gap-1.5 text-red-600 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={() => navigate('/templates')}
          className="px-3 py-1.5 text-xs font-semibold text-black/50 hover:text-black transition-colors"
          style={{ borderRadius: 50, border: '1px solid #e6e6e6' }}
        >
          Cancel
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-black/80 disabled:opacity-50 transition-all active:scale-[0.97]"
          style={{ borderRadius: 50 }}
        >
          {saving ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
          ) : (
            <><Save className="h-3.5 w-3.5" />Save Draft</>
          )}
        </button>
      </div>

      {/* Row 2 — action toolbar */}
      <div
        className="flex items-end gap-4 px-4 py-2"
        style={{ ...barStyle }}
      >
        <Group label="Page">
          <select
            value={currentSizeName ?? ''}
            disabled={!isBlank}
            onChange={e => handlePageSizeChange(e.target.value as PageSizeName)}
            className="h-[26px] px-2 text-xs font-semibold disabled:opacity-40"
            style={{
              background: 'transparent',
              color: 'rgba(0,0,0,0.55)',
              borderRadius: 50,
              border: '1px solid #e6e6e6',
            }}
          >
            <option value="" disabled>Size</option>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
          <ToolbarBtn
            icon={<RectangleVertical size={13} />}
            label="Portrait"
            onClick={() => handleOrientationChange('portrait')}
            accent={isBlank && currentOrientation === 'portrait'}
          />
          <ToolbarBtn
            icon={<RectangleHorizontal size={13} />}
            label="Landscape"
            onClick={() => handleOrientationChange('landscape')}
            accent={isBlank && currentOrientation === 'landscape'}
          />
        </Group>

        <Sep />

        <Group label="Base PDF">
          <ToolbarBtn
            icon={<FileUp size={13} />}
            label={isDetectingAi ? 'Detecting…' : 'Change PDF'}
            onClick={handleChangePdf}
            disabled={isDetectingAi}
          />
          <input ref={basePdfInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleBasePdfFile} />
        </Group>

        <Sep />

        <Group label="Edit">
          <ToolbarBtn icon={<Layout size={13} />} label="Static schema" onClick={handleStaticSchema} />
          <ToolbarBtn
            icon={<PanelTop size={13} />}
            label="Header/Footer"
            onClick={() => setHeaderFooterOpen(true)}
            disabled={!isBlank}
          />
          <ToolbarBtn icon={<FileJson size={13} />} label="JSON" onClick={handleOpenJson} />
          <ToolbarBtn icon={<Sparkles size={13} />} label="Ask AI" onClick={() => setAiOpen(true)} />
        </Group>

        <Sep />

        <Group label="Project">
          <ToolbarBtn icon={<Save size={13} />} label="Save Draft" onClick={handleSave} accent />
          <ToolbarBtn icon={<Copy size={13} />} label="Save As" onClick={handleSaveAs} />
          <ToolbarBtn icon={<RotateCcw size={13} />} label="Reset" onClick={handleReset} />
          <ToolbarBtn icon={<UploadCloud size={13} />} label="Publish" onClick={() => void handleOpenPublish()} disabled={!id} />
        </Group>

        <Sep />

        <Group label="Output">
          <ToolbarBtn icon={<FileDown size={13} />} label="Template JSON" onClick={handleDownloadTemplateJson} />
          <ToolbarBtn
            icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
            label={generating ? 'Generating…' : 'Generate PDF'}
            onClick={handleGeneratePdf}
            disabled={generating}
          />
          <ToolbarBtn icon={<Code size={13} />} label="API" onClick={() => setApiPayloadOpen(true)} />
        </Group>
      </div>

      {/* JSON editor modal */}
      {jsonOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.40)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: '60vw', maxWidth: 800,
            background: '#fff',
            border: '1px solid #e6e6e6',
            borderRadius: 16,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Template JSON</span>
              <button onClick={() => setJsonOpen(false)} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <textarea
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              style={{
                width: '100%', height: '60vh',
                background: '#f7f7f5',
                color: '#000',
                fontFamily: "'Geist Mono', monospace",
                fontSize: 12,
                border: 'none',
                padding: 16,
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ padding: '10px 16px', borderTop: '1px solid #e6e6e6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setJsonOpen(false)}
                style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid #e6e6e6', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleApplyJson}
                style={{ padding: '6px 16px', borderRadius: 50, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI form builder panel */}
      {aiOpen && (
        <AskAiPanel onClose={() => setAiOpen(false)} onTemplateReady={handleAiTemplateReady} />
      )}

      {/* Header & Footer editor */}
      {headerFooterOpen && currentBasePdf && isBlankPdf(currentBasePdf) && (
        <HeaderFooterEditor
          basePdf={currentBasePdf}
          onSave={handleHeaderFooterSave}
          onClose={() => setHeaderFooterOpen(false)}
        />
      )}

      {/* API payload modal */}
      {apiPayloadOpen && (
        <ApiPayloadModal
          templateId={id ?? null}
          template={designerRef.current?.getTemplate() ?? BLANK_TEMPLATE}
          onClose={() => setApiPayloadOpen(false)}
        />
      )}

      {/* Publish modal */}
      {publishOpen && (
        <PublishModal
          publishedVersions={publishedVersions}
          publishing={publishing}
          onPublish={handlePublish}
          onClose={() => setPublishOpen(false)}
        />
      )}

      {/* Designer canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}
