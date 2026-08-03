export default function SignerDetailsPanel(props: {
  fieldLabel: string;
  name: string;
  email: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
}) {
  const { fieldLabel, name, email, onNameChange, onEmailChange } = props;

  return (
    <div
      style={{
        border: '1px solid #e6e6e6',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 10 }}>
        Details for: {fieldLabel}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginBottom: 4 }}>
            Full name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Jane Doe"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="jane@example.com"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
      </div>
    </div>
  );
}
