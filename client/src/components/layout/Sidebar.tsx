import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Settings,
  LogOut,
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
                'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150',
                'border border-transparent',
                isActive
                  ? 'bg-black text-white rounded-[50px]'
                  : 'text-black/60 hover:text-black hover:bg-black/[0.05] rounded-[50px]'
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
      style={{ borderRight: '1px solid #e6e6e6' }}
    >
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-3 px-5 shrink-0"
        style={{ borderBottom: '1px solid #e6e6e6' }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 bg-black"
        >
          <FileText className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight text-black">PDF Manager</span>
          <span
            className="text-[10px] font-medium tracking-widest uppercase"
            style={{ fontFamily: "'Geist Mono', monospace", color: '#000', opacity: 0.4 }}
          >
            Nexgen
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <p
          className="px-3 py-2 text-[10px] font-medium tracking-widest uppercase"
          style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.35)' }}
        >
          Navigation
        </p>
        <NavItem to="/" end icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
        <NavItem to="/templates" icon={<FileText className="h-4 w-4" />} label="Templates" />
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/templates/new" icon={<PlusCircle className="h-4 w-4" />} label="New Template" />
        )}
        {role === 'Admin' && (
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
        )}
      </nav>

      {/* User footer */}
      <div className="p-3 space-y-3" style={{ borderTop: '1px solid #e6e6e6' }}>
        {/* Role switcher */}
        <div>
          <p
            className="px-1 mb-1.5 text-[10px] font-medium tracking-widest uppercase"
            style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.35)' }}
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
                        'flex-1 px-1 py-1 text-[10px] font-semibold transition-all duration-150',
                        role === r
                          ? 'bg-black text-white rounded-[50px]'
                          : 'bg-[#f7f7f5] text-black/50 hover:text-black hover:bg-black/[0.08] rounded-[50px] border border-[#e6e6e6]'
                      )}
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
            <AvatarFallback className="text-xs font-bold bg-black text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-black truncate">{role}</p>
            <p className="text-[10px] truncate" style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.35)' }}>
              Current role
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-black/30 hover:text-black transition-colors"
            title="Home"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
