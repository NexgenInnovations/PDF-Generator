import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';

interface InviteInfo {
  orgName: string;
  role: string;
}

function Shell({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  );
}

export default function Onboarding() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { session, profile, loading, signInWithGoogle, refreshProfile } = useAuth();

  const [orgName, setOrgName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteLoaded, setInviteLoaded] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setInviteLoaded(true);
      return;
    }
    api
      .getInvite(code)
      .then(setInvite)
      .catch(() => setInviteError('This invite link is invalid or has expired.'))
      .finally(() => setInviteLoaded(true));
  }, [code]);

  if (loading || !inviteLoaded) return null;

  if (!session) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">
          {code ? 'Sign in to accept your invite' : 'Sign in to continue'}
        </h1>
        <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => void signInWithGoogle()}>
          Sign in with Google
        </Button>
      </Shell>
    );
  }

  if (profile?.orgId) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">You're already part of an organization</h1>
        <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => navigate('/')}>
          Go to Dashboard
        </Button>
      </Shell>
    );
  }

  const handleAcceptInvite = async () => {
    if (!code) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.acceptInvite(code);
      await refreshProfile();
      navigate('/');
    } catch {
      setError('Could not accept this invite. It may have already been used.');
      setSubmitting(false);
    }
  };

  const handleCreateOrg = async (e: FormEvent) => {
    e.preventDefault();
    if (orgName.trim().length === 0) {
      setError('Please enter an organization name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createOrganization(orgName.trim());
      await refreshProfile();
      navigate('/');
    } catch {
      setError('Something went wrong creating your organization — please try again.');
      setSubmitting(false);
    }
  };

  if (code) {
    if (inviteError) {
      return (
        <Shell>
          <h1 className="text-2xl font-bold tracking-tight">Invalid invite</h1>
          <p className="mt-3 text-base" style={{ color: 'var(--nx-ink-secondary)' }}>{inviteError}</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">Join {invite?.orgName}</h1>
        <p className="mt-3 text-base" style={{ color: 'var(--nx-ink-secondary)' }}>
          You've been invited to join as <strong>{invite?.role}</strong>.
        </p>
        {error && (
          <div
            className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm mt-4"
            role="alert"
            style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button size="lg" className="h-12 px-6 text-base mt-6" disabled={submitting} onClick={handleAcceptInvite}>
          {submitting ? 'Joining…' : `Join ${invite?.orgName}`}
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight">Create your organization</h1>
      <p className="mt-3 text-base" style={{ color: 'var(--nx-ink-secondary)' }}>
        You'll be the Admin and can invite teammates afterward.
      </p>
      <form onSubmit={handleCreateOrg} className="mt-8 w-full max-w-sm flex flex-col gap-3 text-left">
        <label className="sr-only" htmlFor="org-name">Organization name</label>
        <Input
          id="org-name"
          placeholder="Organization name"
          value={orgName}
          disabled={submitting}
          onChange={(e) => setOrgName(e.target.value)}
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
          {submitting ? 'Creating…' : 'Create organization'}
        </Button>
      </form>
    </Shell>
  );
}
