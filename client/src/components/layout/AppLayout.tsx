import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';
import { useTheme } from '../../context/ThemeContext.js';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: isDark ? '#000000' : '#F0F4FA' }}
    >
      <Sidebar />
      <div className="flex flex-1 flex-col pl-60">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
