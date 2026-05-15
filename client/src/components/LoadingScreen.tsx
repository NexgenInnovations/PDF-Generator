import nexgenLogo from '/nexgen-logo.png';

function PoweredBy() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <span style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.2em',
        textTransform: 'uppercase' as const,
        color: '#A0B4CC',
      }}>Powered by</span>
      <div style={{
        padding: '10px 20px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(0,207,255,0.18)',
        boxShadow: '0 0 20px rgba(0,207,255,0.12)',
        display: 'flex', alignItems: 'center',
      }}>
        <img src={nexgenLogo} alt="Nexgen Innovations" style={{ height: 36, display: 'block', objectFit: 'contain' }} />
      </div>
    </div>
  );
}

export type LoadingVariant = 'light' | 'dark' | 'minimal';

interface LoadingScreenProps {
  variant?: LoadingVariant;
  status?: string;
}

export function LoadingScreen({ variant = 'light', status = 'Loading your workspace' }: LoadingScreenProps) {
  if (variant === 'dark') return <LoadingDark status={status} />;
  if (variant === 'minimal') return <LoadingMinimal status={status} />;
  return <LoadingDark status={status} />;
}

function LoadingDark({ status }: { status: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#000000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, overflow: 'hidden',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Radial glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% 35%, rgba(0,87,255,0.14) 0%, rgba(0,207,255,0.06) 45%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Dot grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.25 }}>
        <defs>
          <pattern id="dotDk" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(0,207,255,0.4)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotDk)" />
      </svg>

      {/* Card */}
      <div style={{
        width: 440,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(0,207,255,0.18)',
        borderRadius: 20,
        padding: '48px 44px 44px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 0 0 1px rgba(0,207,255,0.05), 0 0 60px rgba(0,87,255,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28,
        position: 'relative',
      }}>
        {/* Top gradient line */}
        <div style={{
          position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
          background: 'linear-gradient(90deg, transparent, #0057FF, #00CFFF, transparent)',
          borderRadius: 1,
        }} />

        {/* Spinner */}
        <div style={{ position: 'relative', width: 96, height: 96 }}>
          <svg width="96" height="96" viewBox="0 0 96 96" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <linearGradient id="spinG" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0057FF" />
                <stop offset="100%" stopColor="#00CFFF" />
              </linearGradient>
            </defs>
            <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(0,207,255,0.08)" strokeWidth="1.5" />
            <circle className="ls-ring-d" cx="48" cy="48" r="44" fill="none"
              stroke="url(#spinG)" strokeWidth="2" strokeLinecap="round"
              strokeDasharray="60 218"
              style={{ transformOrigin: '48px 48px' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 8,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #050A1A, #020510)',
            border: '1px solid rgba(0,207,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)',
          }}>
            {/* Nexgen flame mark */}
            <svg width="36" height="40" viewBox="0 0 80 92" fill="none">
              <path d="M52 88 C52 88 72 72 68 48 C65 30 54 22 54 22 C54 22 58 36 50 50 C44 61 38 64 38 72 C38 80 52 88 52 88Z"
                fill="url(#fl1)" />
              <path d="M34 88 C34 88 14 70 20 46 C25 26 38 16 38 16 C38 16 32 32 40 48 C46 60 52 62 52 72 C52 80 34 88 34 88Z"
                fill="url(#fl2)" />
              <path d="M43 88 C43 88 30 76 32 60 C34 48 42 42 42 42 C42 42 40 54 46 64 C50 72 50 80 43 88Z"
                fill="url(#fl3)" opacity="0.9" />
              <defs>
                <linearGradient id="fl1" x1="68" y1="22" x2="50" y2="88" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0057FF" />
                  <stop offset="100%" stopColor="#0040CC" />
                </linearGradient>
                <linearGradient id="fl2" x1="20" y1="16" x2="40" y2="88" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00CFFF" />
                  <stop offset="100%" stopColor="#0090CC" />
                </linearGradient>
                <linearGradient id="fl3" x1="42" y1="42" x2="43" y2="88" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#60E0FF" />
                  <stop offset="100%" stopColor="#0057FF" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em',
            background: 'linear-gradient(135deg, #FFFFFF 0%, #A0B4CC 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            PDF Template Manager
          </div>
          <div style={{ fontSize: 12, color: '#A0B4CC', fontWeight: 400, letterSpacing: '0.02em' }}>
            Design, version &amp; deliver document templates
          </div>
        </div>

        {/* Status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#A0B4CC',
        }}>
          <div className="ls-dot-pulse" />
          <span>{status}<span className="ls-dots">…</span></span>
        </div>

        {/* Powered by — inside card */}
        <PoweredBy />
      </div>
    </div>
  );
}

function LoadingMinimal({ status }: { status: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#000000',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32,
      zIndex: 9999, overflow: 'hidden',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 55% 45% at 50% 50%, rgba(0,87,255,0.10) 0%, transparent 70%)',
      }} />

      {/* Flame mark */}
      <svg width="56" height="64" viewBox="0 0 80 92" fill="none" style={{ position: 'relative', zIndex: 1, filter: 'drop-shadow(0 0 16px rgba(0,207,255,0.40))' }}>
        <path d="M52 88 C52 88 72 72 68 48 C65 30 54 22 54 22 C54 22 58 36 50 50 C44 61 38 64 38 72 C38 80 52 88 52 88Z" fill="url(#mfl1)" />
        <path d="M34 88 C34 88 14 70 20 46 C25 26 38 16 38 16 C38 16 32 32 40 48 C46 60 52 62 52 72 C52 80 34 88 34 88Z" fill="url(#mfl2)" />
        <path d="M43 88 C43 88 30 76 32 60 C34 48 42 42 42 42 C42 42 40 54 46 64 C50 72 50 80 43 88Z" fill="url(#mfl3)" opacity="0.9" />
        <defs>
          <linearGradient id="mfl1" x1="68" y1="22" x2="50" y2="88" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0057FF" /><stop offset="100%" stopColor="#0040CC" />
          </linearGradient>
          <linearGradient id="mfl2" x1="20" y1="16" x2="40" y2="88" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00CFFF" /><stop offset="100%" stopColor="#0090CC" />
          </linearGradient>
          <linearGradient id="mfl3" x1="42" y1="42" x2="43" y2="88" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60E0FF" /><stop offset="100%" stopColor="#0057FF" />
          </linearGradient>
        </defs>
      </svg>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em',
          background: 'linear-gradient(135deg, #FFFFFF, #A0B4CC)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>PDF Template Manager</div>
        <div style={{ fontSize: 12, color: '#A0B4CC', fontWeight: 400 }}>
          Design, version &amp; deliver document templates
        </div>
      </div>

      <div style={{ width: 1, height: 24, background: 'linear-gradient(180deg, transparent, rgba(0,207,255,0.45))', position: 'relative', zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[0, 0.2, 0.4].map((delay) => (
            <div key={delay} className="ls-mdot" style={{ animationDelay: `${delay}s`, background: delay === 0 ? '#00CFFF' : delay === 0.2 ? '#0088DD' : '#0057FF', boxShadow: `0 0 8px ${delay === 0 ? '#00CFFF' : '#0057FF'}55` }} />
          ))}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A0B4CC', letterSpacing: '0.15em' }}>
          {status.toUpperCase()}<span className="ls-dots">…</span>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 36, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 1 }}>
        <PoweredBy />
      </div>
    </div>
  );
}
