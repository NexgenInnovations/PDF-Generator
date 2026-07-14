import { useEffect, useRef } from 'react';
import { Designer } from '@pdfme/ui';
import type { BlankPdf, Schema } from '@pdfme/common';
import { getFonts, getPlugins } from '../lib/pdfme.js';

const BAND_HEIGHT_MM = 30;

function splitStaticSchema(staticSchema: Schema[] | undefined, pageHeight: number) {
  const header: Schema[] = [];
  const footer: Schema[] = [];
  (staticSchema ?? []).forEach(schema => {
    if (schema.position.y < BAND_HEIGHT_MM) {
      header.push(schema);
    } else if (schema.position.y >= pageHeight - BAND_HEIGHT_MM) {
      footer.push({
        ...schema,
        position: { ...schema.position, y: schema.position.y - (pageHeight - BAND_HEIGHT_MM) },
      });
    }
  });
  return { header, footer };
}

export default function HeaderFooterEditor(props: {
  basePdf: BlankPdf;
  onSave: (staticSchema: Schema[]) => void;
  onClose: () => void;
}) {
  const { basePdf, onSave, onClose } = props;
  const headerContainerRef = useRef<HTMLDivElement | null>(null);
  const footerContainerRef = useRef<HTMLDivElement | null>(null);
  const headerDesignerRef = useRef<Designer | null>(null);
  const footerDesignerRef = useRef<Designer | null>(null);

  useEffect(() => {
    const { header, footer } = splitStaticSchema(basePdf.staticSchema, basePdf.height);

    if (headerContainerRef.current) {
      headerDesignerRef.current = new Designer({
        domContainer: headerContainerRef.current,
        template: {
          basePdf: { width: basePdf.width, height: BAND_HEIGHT_MM, padding: basePdf.padding },
          schemas: [header],
        },
        options: { font: getFonts(), lang: 'en' },
        plugins: getPlugins(),
      });
    }
    if (footerContainerRef.current) {
      footerDesignerRef.current = new Designer({
        domContainer: footerContainerRef.current,
        template: {
          basePdf: { width: basePdf.width, height: BAND_HEIGHT_MM, padding: basePdf.padding },
          schemas: [footer],
        },
        options: { font: getFonts(), lang: 'en' },
        plugins: getPlugins(),
      });
    }

    return () => {
      const h = headerDesignerRef.current;
      const f = footerDesignerRef.current;
      headerDesignerRef.current = null;
      footerDesignerRef.current = null;
      setTimeout(() => { h?.destroy(); f?.destroy(); }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    const headerSchema = headerDesignerRef.current?.getTemplate().schemas[0] ?? [];
    const footerSchema = footerDesignerRef.current?.getTemplate().schemas[0] ?? [];
    const rebasedFooter = footerSchema.map(schema => ({
      ...schema,
      position: { ...schema.position, y: schema.position.y + (basePdf.height - BAND_HEIGHT_MM) },
    }));
    onSave([...headerSchema, ...rebasedFooter]);
  };

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
        width: '70vw', maxWidth: 900,
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Header &amp; Footer</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginBottom: 6 }}>HEADER</div>
            <div ref={headerContainerRef} style={{ height: 160, border: '1px solid #e6e6e6', borderRadius: 8, overflow: 'hidden' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginBottom: 6 }}>FOOTER</div>
            <div ref={footerContainerRef} style={{ height: 160, border: '1px solid #e6e6e6', borderRadius: 8, overflow: 'hidden' }} />
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
            onClick={handleSave}
            style={{ padding: '6px 16px', borderRadius: 50, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
