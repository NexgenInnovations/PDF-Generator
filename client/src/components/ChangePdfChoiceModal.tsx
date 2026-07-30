// client/src/components/ChangePdfChoiceModal.tsx
export default function ChangePdfChoiceModal(props: {
  onWriteOnPdf: () => void;
  onRecreateWithAi: () => void;
  onClose: () => void;
}) {
  const { onWriteOnPdf, onRecreateWithAi, onClose } = props;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '480px', maxWidth: '90vw',
          background: '#fff',
          border: '1px solid #e6e6e6',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>How should this PDF be used?</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onWriteOnPdf}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 12,
              border: '1px solid #e6e6e6', background: 'transparent', cursor: 'pointer',
            }}
          >
            <div style={{ color: '#000', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Write on the PDF</div>
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 12 }}>
              Keeps the real PDF and overlays any fillable fields it already has.
            </div>
          </button>

          <button
            onClick={onRecreateWithAi}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 12,
              border: '1px solid #e6e6e6', background: 'transparent', cursor: 'pointer',
            }}
          >
            <div style={{ color: '#000', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Recreate with AI</div>
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 12 }}>
              Generates a new form inspired by this document's content.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
