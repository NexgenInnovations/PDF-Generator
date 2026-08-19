import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../context/AuthContext.js';

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (email.trim().length === 0) {
      setError('Please enter your email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await sendPasswordReset(email.trim());
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    setSent(true);
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
      {sent ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            If that email is registered, we've sent a link to reset your password.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            Enter your email and we'll send you a link to reset your password.
          </p>
          <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm flex flex-col gap-3 text-left">
            <label className="sr-only" htmlFor="forgot-email">Email</label>
            <Input
              id="forgot-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              disabled={submitting}
              onChange={(e) => setEmail(e.target.value)}
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
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        </>
      )}
      <Link to="/login" className="mt-6 text-sm" style={{ color: 'var(--nx-accent)' }}>
        Back to sign in
      </Link>
    </div>
  );
}
