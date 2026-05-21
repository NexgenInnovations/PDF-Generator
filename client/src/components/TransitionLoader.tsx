import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const SHOW_MS = 1600;
const FADE_MS = 400;

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
        background: 'rgba(255, 255, 255, 0.92)',
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
      {/* Logo mark */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <span style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 11,
          fontWeight: 400,
          letterSpacing: '0.20em',
          textTransform: 'uppercase',
          color: 'rgba(0,0,0,0.35)',
        }}>
          Nexgen Innovations
        </span>
      </div>

      {/* Black progress bar — bottom edge */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        background: '#f7f7f5',
        overflow: 'hidden',
      }}>
        <div
          style={{
            height: '100%',
            background: '#000',
            animation: `nx-progress ${SHOW_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
          }}
        />
      </div>
    </div>
  );
}
