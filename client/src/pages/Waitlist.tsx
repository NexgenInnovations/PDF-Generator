import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { api } from '../lib/api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error';

export default function Waitlist() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (name.trim().length === 0) {
      setValidationError('Please enter your name.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setValidationError('Please enter a valid email address.');
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    setStatus('submitting');

    try {
      const result = await api.submitWaitlist(name.trim(), email.trim());
      setStatus(result.alreadyOnList ? 'duplicate' : 'success');
    } catch (err) {
      setSubmitError((err as Error).message);
      setStatus('error');
    }
  };

  return (
    <div style={{ background: 'var(--nx-canvas)', color: 'var(--nx-ink)' }} className="min-h-screen">
      <header className="flex h-16 items-center px-6 sm:px-10">
        <button
          onClick={() => navigate('/welcome')}
          className="flex items-center gap-2"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)]"
            style={{ background: 'var(--nx-accent-tint)' }}
          >
            <FileText className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
          </div>
          <span className="text-sm font-semibold tracking-tight">NexGen PDF Manager</span>
        </button>
      </header>

      <main className="flex flex-col items-center px-6 sm:px-10 pt-16 pb-24 text-center">
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium mb-6"
          style={{ background: 'var(--nx-accent-tint)', color: 'var(--nx-accent)' }}
        >
          Coming soon
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] max-w-2xl">
          Get early access to what's next
        </h1>
        <p className="mt-5 text-lg max-w-lg" style={{ color: 'var(--nx-ink-secondary)' }}>
          We're building new plans and features for NexGen PDF Manager — join the waitlist to be
          the first to know, and get early access when they launch.
        </p>

        <div className="mt-10 w-full max-w-sm">
          {status === 'success' || status === 'duplicate' ? (
            <p className="text-base font-semibold" style={{ color: 'var(--nx-ink)' }}>
              {status === 'success'
                ? "You're on the list — we'll be in touch."
                : "You're already on the list!"}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
              <label className="sr-only" htmlFor="waitlist-name">Name</label>
              <Input
                id="waitlist-name"
                placeholder="Name"
                value={name}
                disabled={status === 'submitting'}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="sr-only" htmlFor="waitlist-email">Email</label>
              <Input
                id="waitlist-email"
                type="email"
                placeholder="Email"
                value={email}
                disabled={status === 'submitting'}
                onChange={(e) => setEmail(e.target.value)}
              />
              {validationError && (
                <div
                  className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
                  style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}
              {status === 'error' && submitError && (
                <div
                  className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
                  style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
              <Button type="submit" size="lg" className="h-12 text-base" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
                {status !== 'submitting' && <CheckCircle2 className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
