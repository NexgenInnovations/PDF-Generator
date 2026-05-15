import { Bell, Search } from 'lucide-react';
import { Input } from '../ui/input.js';
import { ThemeToggle } from '../ThemeToggle.js';
import { useTheme } from '../../context/ThemeContext.js';
import { cn } from '../../lib/utils.js';

interface TopBarProps {
  title: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
}

export function TopBar({ title, ctaLabel, onCtaClick, className }: TopBarProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <header
      className={cn('sticky top-0 z-30 flex h-16 items-center gap-4 px-6', className)}
      style={{
        backgroundColor: isDark ? '#000000' : '#F0F4FA',
        borderBottom: `1px solid ${isDark ? 'rgba(0,207,255,0.12)' : 'rgba(0,87,255,0.12)'}`,
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Title */}
      <h1
        className="text-lg font-bold flex-1 tracking-tight"
        style={{
          color: isDark ? '#FFFFFF' : '#0D1B2E',
          background: 'none',
          WebkitTextFillColor: 'unset',
        }}
      >
        {title}
      </h1>

      {/* Search */}
      <div className="relative hidden sm:block w-56">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          style={{ color: isDark ? 'rgba(160,180,204,0.50)' : 'rgba(74,96,128,0.50)' }}
        />
        <Input
          type="search"
          placeholder="Search…"
          className="pl-8 h-8 text-xs"
          style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.80)',
            borderColor: isDark ? 'rgba(0,207,255,0.20)' : 'rgba(0,87,255,0.20)',
            color: isDark ? '#FFFFFF' : '#0D1B2E',
          }}
        />
      </div>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Bell */}
      <button
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200"
        style={{
          color: isDark ? '#A0B4CC' : '#4A6080',
          border: `1px solid ${isDark ? 'rgba(0,207,255,0.15)' : 'rgba(0,87,255,0.15)'}`,
          background: 'transparent',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = '#00CFFF';
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,207,255,0.06)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = isDark ? '#A0B4CC' : '#4A6080';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <Bell className="h-4 w-4" />
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
          style={{ background: '#00CFFF', boxShadow: '0 0 6px #00CFFF' }}
        />
        <span className="sr-only">Notifications</span>
      </button>

      {/* CTA */}
      {ctaLabel && onCtaClick && (
        <button
          onClick={onCtaClick}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
          style={{
            background: 'linear-gradient(135deg, #0057FF 0%, #00CFFF 100%)',
            boxShadow: '0 0 14px rgba(0,207,255,0.35)',
          }}
        >
          {ctaLabel}
        </button>
      )}
    </header>
  );
}
