import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Settings,
  LogOut,
  Image,
  BookOpen,
  LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.js';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip.js';
import { cn } from '../../lib/utils.js';
import { TOUR_ANCHORS } from '../../lib/productTour.js';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  tourId?: string;
}

function NavItem({ to, icon, label, end, tourId }: NavItemProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <NavLink
            to={to}
            end={end}
            data-tour={tourId}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors duration-150 rounded-[var(--nx-radius-sm)]',
                isActive
                  ? 'bg-[var(--nx-accent-tint)] text-[var(--nx-accent)]'
                  : 'text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)] hover:text-[var(--nx-ink)]'
              )
            }
          >
            <span className="shrink-0">{icon}</span>
            <span>{label}</span>
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Sidebar() {
  const { role, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const displayName = profile?.fullName ?? 'Account';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-white"
      style={{ borderRight: '1px solid var(--nx-hairline)' }}
    >
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-3 px-5 shrink-0"
        style={{ borderBottom: '1px solid var(--nx-hairline)' }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)] shrink-0"
          style={{ background: 'var(--nx-accent)' }}
        >
          <FileText className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--nx-ink)' }}>Build Doc</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <p
          className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--nx-ink-muted)' }}
        >
          Navigation
        </p>
        <NavItem to="/" end icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" tourId={TOUR_ANCHORS.sidebarDashboard} />
        <NavItem to="/templates" icon={<FileText className="h-4 w-4" />} label="Templates" tourId={TOUR_ANCHORS.sidebarTemplates} />
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/templates/new" icon={<PlusCircle className="h-4 w-4" />} label="New Template" tourId={TOUR_ANCHORS.sidebarNewTemplate} />
        )}
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/templates/gallery" icon={<LayoutGrid className="h-4 w-4" />} label="Template Gallery" tourId={TOUR_ANCHORS.sidebarGallery} />
        )}
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/assets" icon={<Image className="h-4 w-4" />} label="Assets" tourId={TOUR_ANCHORS.sidebarAssets} />
        )}
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/letterheads" icon={<BookOpen className="h-4 w-4" />} label="Letterheads" tourId={TOUR_ANCHORS.sidebarLetterheads} />
        )}
        {role === 'Admin' && (
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
        )}
      </nav>

      {/* User footer */}
      <div
        className="p-3 space-y-3"
        style={{ borderTop: '1px solid var(--nx-hairline)' }}
        data-tour={TOUR_ANCHORS.sidebarRoleSwitcher}
      >
        <div className="flex items-center gap-3 px-1">
          <Avatar className="h-8 w-8 shrink-0">
            {profile?.avatarUrl ? (
              <AvatarImage src={profile.avatarUrl} alt={displayName} />
            ) : (
              <AvatarFallback className="text-xs font-semibold text-white" style={{ background: 'var(--nx-ink)' }}>
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--nx-ink)' }}>{displayName}</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--nx-ink-muted)' }}>
              {role ?? '—'}
            </p>
          </div>
          <button
            onClick={() => void handleSignOut()}
            className="transition-colors"
            style={{ color: 'var(--nx-ink-muted)' }}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
