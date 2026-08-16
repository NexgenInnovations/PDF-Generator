import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ClipboardList, Folder } from 'lucide-react';
import { api } from '../lib/api.js';
import type { SubmissionFolderRecord } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';

function FolderSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="rounded-[var(--nx-radius-sm)]" style={{ background: 'var(--nx-surface)', aspectRatio: '4 / 3' }} />
      <div className="h-2.5 rounded w-3/4" style={{ background: 'var(--nx-hairline)' }} />
    </div>
  );
}

export default function AllSubmissions() {
  const [folders, setFolders] = useState<SubmissionFolderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listSubmissionFolders()
      .then(setFolders)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <FolderSkeleton key={i} />)}
          </div>
        )}

        {!loading && folders.length === 0 && (
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
            <p className="text-base font-semibold" style={{ color: 'var(--nx-ink)' }}>No submission folders yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--nx-ink-muted)' }}>
              Publish a template to get a folder here — filled PDFs will show up inside it as people submit them.
            </p>
          </Card>
        )}

        {!loading && folders.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {folders.map(f => (
              <Link key={f.template_id} to={`/templates/${f.template_id}/submissions`}>
                <Card className="p-4 flex flex-col items-center text-center gap-2 hover:shadow-md transition-shadow">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-[var(--nx-radius-sm)]"
                    style={{ background: 'var(--nx-accent-tint)' }}
                  >
                    <Folder className="h-6 w-6" style={{ color: 'var(--nx-accent)' }} />
                  </div>
                  <p className="text-xs font-semibold truncate w-full" style={{ color: 'var(--nx-ink)' }}>
                    {f.template_name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>
                    {f.submission_count} submission{f.submission_count === 1 ? '' : 's'}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
