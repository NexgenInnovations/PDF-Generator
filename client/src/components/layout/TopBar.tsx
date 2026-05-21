import { Bell, Search } from 'lucide-react';
import { Input } from '../ui/input.js';
import { cn } from '../../lib/utils.js';

interface TopBarProps {
  title: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
}

export function TopBar({ title, ctaLabel, onCtaClick, className }: TopBarProps) {
  return (
    <header
      className={cn('sticky top-0 z-30 flex h-16 items-center gap-4 px-6 bg-white', className)}
      style={{ borderBottom: '1px solid #e6e6e6' }}
    >
      {/* Title */}
      <h1 className="text-lg font-bold flex-1 tracking-tight text-black">
        {title}
      </h1>

      {/* Search */}
      <div className="relative hidden sm:block w-56">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black/30"
        />
        <Input
          type="search"
          placeholder="Search…"
          className="pl-8 h-8 text-xs bg-[#f7f7f5] border-[#e6e6e6] text-black placeholder:text-black/30 rounded-[50px]"
        />
      </div>

      {/* Bell */}
      <button
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-black/40 hover:text-black hover:bg-[#f7f7f5] transition-all duration-150 border border-[#e6e6e6]"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-black" />
        <span className="sr-only">Notifications</span>
      </button>

      {/* CTA */}
      {ctaLabel && onCtaClick && (
        <button
          onClick={onCtaClick}
          className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-black transition-all duration-150 hover:bg-black/80 active:scale-[0.97]"
          style={{ borderRadius: 50 }}
        >
          {ctaLabel}
        </button>
      )}
    </header>
  );
}
