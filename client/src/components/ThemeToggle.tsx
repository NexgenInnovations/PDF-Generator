import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.js';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: 60,
        height: 30,
        borderRadius: 999,
        padding: '3px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        border: isDark
          ? '1px solid rgba(0,207,255,0.30)'
          : '1px solid rgba(0,87,255,0.25)',
        background: isDark
          ? 'linear-gradient(135deg, rgba(0,87,255,0.25) 0%, rgba(0,207,255,0.15) 100%)'
          : 'linear-gradient(135deg, rgba(0,87,255,0.12) 0%, rgba(0,207,255,0.08) 100%)',
        boxShadow: isDark
          ? '0 0 10px rgba(0,207,255,0.20), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 0 8px rgba(0,87,255,0.12)',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Track icons */}
      <span style={{
        position: 'absolute',
        left: 7,
        display: 'flex',
        alignItems: 'center',
        opacity: isDark ? 1 : 0,
        transition: 'opacity 0.2s ease',
        pointerEvents: 'none',
      }}>
        <Moon style={{ width: 11, height: 11, color: '#00CFFF' }} />
      </span>
      <span style={{
        position: 'absolute',
        right: 7,
        display: 'flex',
        alignItems: 'center',
        opacity: isDark ? 0 : 1,
        transition: 'opacity 0.2s ease',
        pointerEvents: 'none',
      }}>
        <Sun style={{ width: 11, height: 11, color: '#0057FF' }} />
      </span>

      {/* Thumb */}
      <span style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: '50%',
        transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), background 0.3s ease, box-shadow 0.3s ease',
        transform: isDark ? 'translateX(0px)' : 'translateX(29px)',
        background: isDark
          ? 'linear-gradient(135deg, #0057FF, #00CFFF)'
          : 'linear-gradient(135deg, #0057FF, #0090DD)',
        boxShadow: isDark
          ? '0 0 8px rgba(0,207,255,0.50)'
          : '0 0 6px rgba(0,87,255,0.35)',
      }}>
        {isDark
          ? <Moon style={{ width: 11, height: 11, color: '#fff' }} />
          : <Sun style={{ width: 11, height: 11, color: '#fff' }} />
        }
      </span>
    </button>
  );
}
