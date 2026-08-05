import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, ClipboardList, CheckCircle2, PenLine } from 'lucide-react';
import { api } from '../lib/api.js';
import type { SubmissionRecord } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';

function SubmissionSkeleton() {
  return (
    <div
      className="animate-pulse rounded-[var(--nx-radius-md)] border p-4 space-y-3"
      style={{ background: 'var(--nx-surface)', borderColor: 'var(--nx-hairline)' }}
    >
      <div className="flex items-center justify-between">
        <div className="h-2.5 rounded w-24" style={{ background: 'var(--nx-hairline)' }} />
        <div className="h-2.5 rounded w-32" style={{ background: 'var(--nx-hairline)' }} />
      </div>
      <div className="h-10 rounded" style={{ background: 'var(--nx-hairline)' }} />
    </div>
  );
}

export default function Submissions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.listSubmissions(id)
      .then(setSubmissions)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <AppLayout>
      <TopBar title="Submissions" />
      <div className="p-6 space-y-4">
        <button
          onClick={() => navigate('/templates')}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-[var(--nx-ink)]"
          style={{ color: 'var(--nx-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Templates
        </button>

        {error && (
          <div className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm" style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <SubmissionSkeleton key={i} />)}
          </div>
        )}

        {!loading && submissions.length === 0 && (
          <Card
            className="p-16 flex flex-col items-center justify-center text-center"
            style={{ background: 'var(--nx-surface)' }}
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full mb-4"
              style={{ background: 'var(--nx-accent-tint)' }}
            >
              <ClipboardList className="h-6 w-6" style={{ color: 'var(--nx-accent)' }} />
            </div>
            <p className="text-base font-semibold" style={{ color: 'var(--nx-ink)' }}>No submissions yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--nx-ink-muted)' }}>
              Filled and signed documents for this template will show up here.
            </p>
          </Card>
        )}

        {!loading && submissions.length > 0 && (
          <div className="space-y-3">
            {submissions.map(s => (
              <Card key={s.id} className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--nx-accent-tint)' }}
                  >
                    <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
                  </div>
                  <div className="min-w-0 flex-1 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold" style={{ color: 'var(--nx-ink)' }}>
                      Version {s.template_version}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>
                      {new Date(s.submitted_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                {s.signatureEvents.length === 0 ? (
                  <p className="text-xs pl-11" style={{ color: 'var(--nx-ink-muted)' }}>No signature fields on this submission.</p>
                ) : (
                  <div className="space-y-2 pl-11">
                    {s.signatureEvents.map(evt => (
                      <div
                        key={evt.id}
                        className="text-xs flex items-start gap-2"
                        style={{ padding: '8px 10px', background: 'var(--nx-surface)', borderRadius: 8 }}
                      >
                        <PenLine className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: 'var(--nx-accent)' }} />
                        <div className="min-w-0">
                          <div style={{ fontWeight: 600, color: 'var(--nx-ink)' }}>{evt.field_name}</div>
                          <div style={{ color: 'var(--nx-ink-secondary)' }}>
                            {evt.signer_name} &lt;{evt.signer_email}&gt;
                          </div>
                          <div style={{ color: 'var(--nx-ink-muted)', fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>
                            Signed {new Date(evt.signed_at).toLocaleString()}
                            {evt.ip_address ? ` from ${evt.ip_address}` : ''}
                          </div>
                          <div style={{ color: 'var(--nx-ink-muted)', fontFamily: "'Geist Mono', monospace", fontSize: 10, wordBreak: 'break-all' }}>
                            SHA-256: {evt.document_hash}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
