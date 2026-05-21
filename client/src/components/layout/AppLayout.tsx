import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-60">
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
