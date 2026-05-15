import { NavLink, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext.js';
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
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-gradient-to-r from-[rgba(0,87,255,0.20)] to-[rgba(0,207,255,0.12)] text-white border border-[rgba(0,207,255,0.25)] shadow-[0_0_12px_rgba(0,207,255,0.12)]'
                  : 'text-[#A0B4CC] hover:bg-[rgba(0,207,255,0.06)] hover:text-white border border-transparent'
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const initials = role === 'FormFiller' ? 'FF' : role.slice(0, 2).toUpperCase();

  return (
    <aside
      style={{
        background: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(240,244,250,0.92)',
        backdropFilter: 'blur(16px)',
        borderRight: isDark ? '1px solid rgba(0,207,255,0.12)' : '1px solid rgba(0,87,255,0.12)',
      }}
      className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col"
    >
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-3 px-4 shrink-0"
        style={{ borderBottom: isDark ? '1px solid rgba(0,207,255,0.10)' : '1px solid rgba(0,87,255,0.10)' }}
      >
        {/* Nexgen flame icon */}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{ background: 'linear-gradient(135deg, #0057FF 0%, #00CFFF 100%)', boxShadow: '0 0 14px rgba(0,207,255,0.40)' }}
        >
          <FileText className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className={`text-sm font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#0D1B2E]'}`}>PDF Manager</span>
          <span
            className="text-[10px] font-semibold"
            style={{
              background: 'linear-gradient(90deg, #0057FF, #00CFFF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.05em',
            }}
          >
            Nexgen Innovations
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <p className="px-3 py-2 text-[10px] font-semibold tracking-widest text-[#A0B4CC]/50 uppercase">
          Navigation
        </p>
        <NavItem to="/" end icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
        <NavItem to="/templates" icon={<FileText className="h-4 w-4" />} label="Templates" />
        {(role === 'Admin' || role === 'Designer') && (
          <>
            <NavItem to="/templates/new" icon={<PlusCircle className="h-4 w-4" />} label="New Template" />
          </>
        )}
        {role === 'Admin' && (
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
        )}
      </nav>

      {/* User footer */}
      <div
        className="p-3 space-y-3"
        style={{ borderTop: isDark ? '1px solid rgba(0,207,255,0.10)' : '1px solid rgba(0,87,255,0.10)' }}
      >
        {/* Role switcher */}
        <div>
          <p className="px-1 mb-1.5 text-[10px] font-semibold tracking-widest text-[#A0B4CC]/50 uppercase">
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
                        'flex-1 rounded-md px-1 py-1 text-[10px] font-semibold transition-all duration-200',
                        role === r
                          ? 'text-white'
                          : 'bg-[rgba(255,255,255,0.04)] text-[#A0B4CC] hover:text-white hover:bg-[rgba(0,207,255,0.08)] border border-[rgba(0,207,255,0.10)]'
                      )}
                      style={role === r ? {
                        background: 'linear-gradient(135deg, #0057FF, #00CFFF)',
                        boxShadow: '0 0 10px rgba(0,207,255,0.30)',
                        border: 'none',
                      } : {}}
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
            <AvatarFallback
              className="text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #0057FF, #00CFFF)' }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{role}</p>
            <p className="text-[10px] text-[#A0B4CC]/60 truncate">Current role</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-[#A0B4CC]/50 hover:text-[#00CFFF] transition-colors"
            title="Home"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
