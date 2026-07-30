import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Settings,
  LogOut,
  Image,
  BookOpen,
} from 'lucide-react';
import { useRole } from '../../context/RoleContext.js';
import { Avatar, AvatarFallback } from '../ui/avatar.js';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip.js';
import { cn } from '../../lib/utils.js';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
}

function NavItem({ to, icon, label, end }: NavItemProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <NavLink
            to={to}
            end={end}
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
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const initials = role === 'FormFiller' ? 'FF' : role.slice(0, 2).toUpperCase();

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
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--nx-ink)' }}>PDF Manager</span>
          <span className="text-[11px]" style={{ color: 'var(--nx-ink-muted)' }}>
            Nexgen
          </span>
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
        <NavItem to="/" end icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
        <NavItem to="/templates" icon={<FileText className="h-4 w-4" />} label="Templates" />
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/templates/new" icon={<PlusCircle className="h-4 w-4" />} label="New Template" />
        )}
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/assets" icon={<Image className="h-4 w-4" />} label="Assets" />
        )}
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/letterheads" icon={<BookOpen className="h-4 w-4" />} label="Letterheads" />
        )}
        {role === 'Admin' && (
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
        )}
      </nav>

      {/* User footer */}
      <div className="p-3 space-y-3" style={{ borderTop: '1px solid var(--nx-hairline)' }}>
        {/* Role switcher */}
        <div>
          <p
            className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--nx-ink-muted)' }}
          >
            Switch Role
          </p>
          <div className="flex gap-1">
            {(['Admin', 'Designer', 'FormFiller'] as const).map((r) => (
              <TooltipProvider key={r} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setRole(r)}
                      className={cn(
                        'flex-1 px-1 py-1 text-[11px] font-medium transition-colors duration-150 rounded-[var(--nx-radius-sm)]',
                        role === r
                          ? 'text-white'
                          : 'text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)] border border-[var(--nx-hairline)]'
                      )}
                      style={role === r ? { background: 'var(--nx-accent)' } : undefined}
                    >
                      {r === 'FormFiller' ? 'Filler' : r}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Switch to {r}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>

        {/* User row */}
        <div className="flex items-center gap-3 px-1">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs font-semibold text-white" style={{ background: 'var(--nx-ink)' }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--nx-ink)' }}>{role}</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--nx-ink-muted)' }}>
              Current role
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="transition-colors"
            style={{ color: 'var(--nx-ink-muted)' }}
            title="Home"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
