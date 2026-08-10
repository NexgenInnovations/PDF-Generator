import { Navigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { useAuth } from '../context/AuthContext.js';

export default function Login() {
  const { session, profile, loading, signInWithGoogle } = useAuth();

  if (loading) return null;
  if (session) {
    return <Navigate to={profile?.orgId ? '/' : '/onboarding'} replace />;
  }

  return (
    <div
      style={{ background: 'var(--nx-canvas)', color: 'var(--nx-ink)' }}
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[var(--nx-radius-sm)] mb-6"
        style={{ background: 'var(--nx-accent-tint)' }}
      >
        <FileText className="h-6 w-6" style={{ color: 'var(--nx-accent)' }} />
      </div>
      <h1 className="text-3xl font-bold tracking-tight">Sign in to NexGen PDF Manager</h1>
      <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
        Sign in with your Google account to continue.
      </p>
      <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => void signInWithGoogle()}>
        Sign in with Google
      </Button>
    </div>
  );
}
