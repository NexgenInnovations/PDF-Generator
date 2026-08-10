import { useState, type FormEvent } from 'react';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { api } from '../lib/api.js';
import type { Role } from '../types.js';

const INVITABLE_ROLES: Role[] = ['Admin', 'Designer', 'FormFiller'];

export default function Settings() {
  const [role, setRole] = useState<Role>('Designer');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setInviteLink(null);
    try {
      const { code } = await api.createInvite(role);
      setInviteLink(`${window.location.origin}/join/${code}`);
    } catch {
      setError('Something went wrong generating the invite — please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout>
      <TopBar title="Settings" />
      <div className="p-6 max-w-xl">
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--nx-ink)' }}>Invite a teammate</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--nx-ink-secondary)' }}>
            Generate a link that lets someone join your organization with the role you choose.
          </p>
          <form onSubmit={handleGenerate} className="flex flex-col gap-3">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--nx-ink-muted)' }}
              htmlFor="invite-role"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 px-3 text-sm rounded-[var(--nx-radius-sm)]"
              style={{ border: '1px solid var(--nx-hairline)', color: 'var(--nx-ink)' }}
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
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
            <Button type="submit" disabled={generating} className="self-start">
              {generating ? 'Generating…' : 'Generate invite link'}
            </Button>
          </form>

          {inviteLink && (
            <div
              className="mt-5 flex items-center gap-2 p-3 rounded-[var(--nx-radius-sm)]"
              style={{ background: 'var(--nx-surface)', border: '1px solid var(--nx-hairline)' }}
            >
              <code className="flex-1 text-xs truncate" style={{ color: 'var(--nx-ink)' }}>{inviteLink}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
