import { useState } from 'react';
import { getInputFromTemplate, type Template } from '@pdfme/common';

type Mode = 'full' | 'byId';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

function buildInputs(template: Template, mode: Mode): Record<string, string>[] {
  const fullInputs = getInputFromTemplate(template);
  if (mode === 'full') return fullInputs;
  const first = fullInputs[0] ?? {};
  const trimmed = Object.fromEntries(Object.entries(first).slice(0, 2));
  return [trimmed];
}

export default function ApiPayloadModal(props: {
  templateId: string | null;
  template: Template;
  onClose: () => void;
}) {
  const { templateId, template, onClose } = props;
  const [mode, setMode] = useState<Mode>('full');

  const url = `${window.location.origin}${API_BASE}/generate-pdf`;
  const displayedTemplateId = templateId ?? '<save the template first>';
  const body = {
    template_id: displayedTemplateId,
    inputs: buildInputs(template, mode),
  };
  const bodyText = JSON.stringify(body, null, 2);
  const shellEscapedBody = bodyText.replace(/'/g, `'\\''`);
  const curlText = `curl -X POST ${url} \\\n  -H 'Content-Type: application/json' \\\n  -d '${shellEscapedBody}'`;

  const copyBody = () => { void navigator.clipboard.writeText(bodyText); };
  const copyCurl = () => { void navigator.clipboard.writeText(curlText); };

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
        width: '60vw', maxWidth: 800,
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>API payload</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setMode('full')}
              style={{
                padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: mode === 'full' ? 'none' : '1px solid #e6e6e6',
                background: mode === 'full' ? '#000' : 'transparent',
                color: mode === 'full' ? '#fff' : 'rgba(0,0,0,0.55)',
              }}
            >
              Full template
            </button>
            <button
              onClick={() => setMode('byId')}
              style={{
                padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: mode === 'byId' ? 'none' : '1px solid #e6e6e6',
                background: mode === 'byId' ? '#000' : 'transparent',
                color: mode === 'byId' ? '#fff' : 'rgba(0,0,0,0.55)',
              }}
            >
              By ID
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 50, background: '#000', color: '#fff', fontWeight: 700, fontSize: 11,
            }}>
              POST
            </span>
            <span style={{ color: 'rgba(0,0,0,0.70)', wordBreak: 'break-all' }}>{url}</span>
          </div>

          {templateId === null && (
            <div style={{ color: '#dc2626', fontSize: 12 }}>
              Save this template to get a real template_id.
            </div>
          )}

          <pre style={{
            margin: 0,
            width: '100%', maxHeight: '40vh', overflow: 'auto',
            background: '#f7f7f5',
            color: '#000',
            fontFamily: "'Geist Mono', monospace",
            fontSize: 12,
            padding: 16,
            borderRadius: 8,
            boxSizing: 'border-box',
          }}>
            {bodyText}
          </pre>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #e6e6e6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={copyBody}
            style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid #e6e6e6', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Copy body
          </button>
          <button
            onClick={copyCurl}
            style={{ padding: '6px 16px', borderRadius: 50, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Copy as curl
          </button>
        </div>
      </div>
    </div>
  );
}
