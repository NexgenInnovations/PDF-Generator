import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../context/AuthContext.js';

export default function ResetPassword() {
  const { recoveryMode, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/');
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
      {/* Gate on the password-recovery event, not on any live session: an already-signed-in
          visitor must not be able to change the password without re-authenticating. */}
      {!recoveryMode ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">This reset link is invalid or has expired</h1>
          <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => navigate('/forgot-password')}>
            Request a new link
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
          <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm flex flex-col gap-3 text-left">
            <label className="sr-only" htmlFor="new-password">New password</label>
            <Input
              id="new-password"
              type="password"
              placeholder="New password"
              value={password}
              disabled={submitting}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="sr-only" htmlFor="confirm-password">Confirm password</label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm password"
              value={confirm}
              disabled={submitting}
              onChange={(e) => setConfirm(e.target.value)}
            />
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
              {submitting ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
          <Link to="/login" className="mt-6 text-sm" style={{ color: 'var(--nx-accent)' }}>
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}
