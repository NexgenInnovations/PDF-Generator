import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ClipboardList, FileText, Download } from 'lucide-react';
import { api, downloadFile } from '../lib/api.js';
import type { AllSubmissionsRecord } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';

function formatFileSize(bytes: number | null) {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SubmissionSkeleton() {
  return (
    <div
      className="animate-pulse rounded-[var(--nx-radius-md)] border p-4"
      style={{ background: 'var(--nx-surface)', borderColor: 'var(--nx-hairline)' }}
    >
      <div className="h-3 rounded w-1/3 mb-2" style={{ background: 'var(--nx-hairline)' }} />
      <div className="h-2.5 rounded w-1/4" style={{ background: 'var(--nx-hairline)' }} />
    </div>
  );
}

export default function AllSubmissions() {
  const [submissions, setSubmissions] = useState<AllSubmissionsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    api.listAllSubmissions()
      .then(setSubmissions)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (submission: AllSubmissionsRecord) => {
    setDownloadingId(submission.id);
    setError(null);
    try {
      await downloadFile(
        api.generatedPdfFileUrl(submission.id),
        `${submission.template_name}-${submission.submission_id}.pdf`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <AppLayout>
      <TopBar title="Submissions" />
      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm" style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <SubmissionSkeleton key={i} />)}
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
              Filled PDFs from every template will show up here as people submit them.
            </p>
          </Card>
        )}

        {!loading && submissions.length > 0 && (
          <div className="space-y-3">
            {submissions.map(s => (
              <Card key={s.id} className="p-4 flex items-center gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--nx-accent-tint)' }}
                >
                  <FileText className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/templates/${s.template_id}/submissions`}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--nx-ink)' }}
                  >
                    {s.template_name}
                  </Link>
                  <p className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>
                    Version {s.template_version} · {formatFileSize(s.file_size_bytes)} · {new Date(s.generated_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => void handleDownload(s)}
                  disabled={downloadingId === s.id}
                  className="flex items-center gap-1 text-xs font-semibold transition-colors hover:text-[var(--nx-ink)] disabled:opacity-50 shrink-0"
                  style={{ color: 'var(--nx-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadingId === s.id ? 'Downloading…' : 'Download'}
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
