import { useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../context/AuthContext.js';

type Mode = 'signin' | 'signup';

export default function Login() {
  const { session, profile, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);

  if (loading) return null;
  if (session) {
    return <Navigate to={profile?.orgId ? '/' : '/onboarding'} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (email.trim().length === 0 || password.length === 0) {
      setError('Please enter your email and password.');
      return;
    }
    if (mode === 'signup') {
      if (fullName.trim().length === 0) {
        setError('Please enter your name.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    setSubmitting(true);
    const result =
      mode === 'signup'
        ? await signUpWithEmail(email.trim(), password, fullName.trim())
        : await signInWithEmail(email.trim(), password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'signup') {
      setSignedUp(true);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
  };

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

      {signedUp ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            We've sent a confirmation link to {email.trim()}. Click it to activate your account, then sign in.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Sign in to NexGen PDF Manager</h1>
          <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            {mode === 'signup' ? 'Create an account to get started.' : 'Sign in to continue.'}
          </p>

          <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => void signInWithGoogle()}>
            Sign in with Google
          </Button>

          <div className="flex items-center gap-3 w-full max-w-sm mt-8" style={{ color: 'var(--nx-ink-secondary)' }}>
            <div className="h-px flex-1" style={{ background: 'var(--nx-hairline)' }} />
            <span className="text-xs uppercase tracking-wide">or</span>
            <div className="h-px flex-1" style={{ background: 'var(--nx-hairline)' }} />
          </div>

          <form onSubmit={handleSubmit} className="mt-6 w-full max-w-sm flex flex-col gap-3 text-left">
            {mode === 'signup' && (
              <>
                <label className="sr-only" htmlFor="full-name">Full name</label>
                <Input
                  id="full-name"
                  placeholder="Full name"
                  value={fullName}
                  disabled={submitting}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </>
            )}
            <label className="sr-only" htmlFor="email">Email</label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              disabled={submitting}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="sr-only" htmlFor="password">Password</label>
            <Input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              disabled={submitting}
              onChange={(e) => setPassword(e.target.value)}
            />

            {mode === 'signin' && (
              <Link to="/forgot-password" className="text-sm self-end" style={{ color: 'var(--nx-accent)' }}>
                Forgot password?
              </Link>
            )}

            {error && (
              <div
                className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
                role="alert"
                style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" className="h-12 text-base" disabled={submitting}>
              {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <button
            type="button"
            className="mt-6 text-sm"
            style={{ color: 'var(--nx-accent)' }}
            onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </>
      )}
    </div>
  );
}
