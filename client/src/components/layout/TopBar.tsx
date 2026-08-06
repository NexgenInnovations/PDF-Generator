import { Bell, Search, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../ui/input.js';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

interface TopBarProps {
  title: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
}

export function TopBar({ title, ctaLabel, onCtaClick, className }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header
      className={cn('sticky top-0 z-30 flex h-16 items-center gap-4 px-6 bg-white', className)}
      style={{ borderBottom: '1px solid var(--nx-hairline)' }}
    >
      {/* Title */}
      <h1 className="text-base font-semibold flex-1 tracking-tight" style={{ color: 'var(--nx-ink)' }}>
        {title}
      </h1>

      {/* Search */}
      <div className="relative hidden sm:block w-56">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          style={{ color: 'var(--nx-ink-muted)' }}
        />
        <Input
          type="search"
          placeholder="Search…"
          className="pl-8 h-8 text-xs rounded-[var(--nx-radius-sm)]"
          style={{ background: 'var(--nx-surface)', borderColor: 'var(--nx-hairline)', color: 'var(--nx-ink)' }}
        />
      </div>

      {/* Take a tour */}
      <button
        onClick={() => navigate('/', { state: { startTour: true } })}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)] transition-colors duration-150"
        style={{ color: 'var(--nx-ink-muted)', border: '1px solid var(--nx-hairline)' }}
        title="Take a tour"
      >
        <HelpCircle className="h-4 w-4" />
        <span className="sr-only">Take a tour</span>
      </button>

      {/* Bell */}
      <button
        className="relative flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)] transition-colors duration-150"
        style={{ color: 'var(--nx-ink-muted)', border: '1px solid var(--nx-hairline)' }}
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--nx-accent)' }} />
        <span className="sr-only">Notifications</span>
      </button>

      {/* CTA */}
      {ctaLabel && onCtaClick && (
        <Button onClick={onCtaClick} size="sm">
          {ctaLabel}
        </Button>
      )}
    </header>
  );
}
