import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { SubmissionRecord } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';

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
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'rgba(0,0,0,0.55)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>Loading…</p>
        ) : submissions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {submissions.map(s => (
              <Card key={s.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--nx-ink)' }}>
                    Version {s.template_version}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>
                    {new Date(s.submitted_at).toLocaleString()}
                  </span>
                </div>
                {s.signatureEvents.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>No signature fields on this submission.</p>
                ) : (
                  <div className="space-y-2">
                    {s.signatureEvents.map(evt => (
                      <div
                        key={evt.id}
                        className="text-xs"
                        style={{ padding: '8px 10px', background: 'var(--nx-surface)', borderRadius: 8 }}
                      >
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
