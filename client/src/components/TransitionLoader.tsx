import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const SHOW_MS = 1600;   // start fade at 1.6s
const FADE_MS = 400;    // fade duration — total = 2s

export function TransitionLoader() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeRef.current) clearTimeout(fadeRef.current);

    setFading(false);
    setVisible(true);

    timerRef.current = setTimeout(() => {
      setFading(true);
      fadeRef.current = setTimeout(() => setVisible(false), FADE_MS);
    }, SHOW_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        /* Lighter semi-transparent overlay */
        background: 'rgba(0, 6, 24, 0.60)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        pointerEvents: fading ? 'none' : 'all',
      }}
    >
      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(0,87,255,0.10) 0%, rgba(0,207,255,0.04) 50%, transparent 75%)',
        pointerEvents: 'none',
      }} />

      {/* "Powered by" */}
      <span style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.25em',
        textTransform: 'uppercase' as const,
        color: 'rgba(160,180,204,0.80)',
        position: 'relative',
        zIndex: 1,
      }}>
        Powered by
      </span>

      {/* Nexgen logo */}
      <img
        src="/nexgen-logo.png"
        alt="Nexgen Innovations"
        style={{
          height: 108,
          objectFit: 'contain',
          position: 'relative',
          zIndex: 1,
          filter: 'drop-shadow(0 0 12px rgba(0,207,255,0.30))',
        }}
      />

      {/* Cyan progress bar — bottom edge */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: 'rgba(0,207,255,0.08)',
        overflow: 'hidden',
      }}>
        <div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, #0057FF 0%, #00CFFF 100%)',
            boxShadow: '0 0 10px rgba(0,207,255,0.50)',
            animation: `nx-progress ${SHOW_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
          }}
        />
      </div>
    </div>
  );
}
