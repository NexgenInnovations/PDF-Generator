import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--nx-ink-muted)' }}>
          {title}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)]"
          style={{ background: 'var(--nx-accent-tint)' }}
        >
          <span style={{ color: 'var(--nx-accent)' }} className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--nx-ink)' }}>{value}</div>
        {description && (
          <p className="text-xs mt-1" style={{ color: 'var(--nx-ink-muted)' }}>
            {description}
          </p>
        )}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { role } = useRole();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const canEdit = role === 'Admin' || role === 'Designer';
  const recent = templates.slice(0, 6);

  return (
    <AppLayout>
      <TopBar
        title="Dashboard"
        ctaLabel={canEdit ? '+ New Template' : undefined}
        onCtaClick={canEdit ? () => navigate('/templates/new') : undefined}
      />

      <div className="p-6 space-y-8">
        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Templates"
            value={loading ? '—' : templates.length}
            icon={<FileText />}
            description="All time"
          />
          <StatCard
            title="Recent Activity"
            value={loading ? '—' : recent.length}
            icon={<TrendingUp />}
            description="Last 7 days"
          />
          <StatCard
            title="Your Role"
            value={role}
            icon={<CheckCircle />}
            description="Current session"
          />
          <StatCard
            title="Last Updated"
            value={
              loading || templates.length === 0
                ? '—'
                : (() => {
                    const t = templates.find((x) => x.updated_at);
                    return t?.updated_at
                      ? new Date(t.updated_at).toLocaleDateString()
                      : 'Never';
                  })()
            }
            icon={<Clock />}
            description="Most recent edit"
          />
        </div>

        {/* Recent templates */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--nx-ink)' }}>
              Recent Templates
            </h2>
            <button
              onClick={() => navigate('/templates')}
              className="text-xs font-medium transition-colors"
              style={{ color: 'var(--nx-accent)' }}
            >
              View all →
            </button>
          </div>

          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-[var(--nx-radius-md)] p-6 space-y-3 border"
                  style={{ background: 'var(--nx-surface)', borderColor: 'var(--nx-hairline)' }}
                >
                  <div className="h-3 rounded w-2/3" style={{ background: 'var(--nx-hairline)' }} />
                  <div className="h-2.5 rounded w-1/3" style={{ background: 'var(--nx-hairline)' }} />
                </div>
              ))}
            </div>
          )}

          {!loading && templates.length === 0 && (
            <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full mb-4"
                style={{ background: 'var(--nx-surface)' }}
              >
                <FileText className="h-6 w-6" style={{ color: 'var(--nx-ink-muted)' }} />
              </div>
              <p className="text-base font-semibold" style={{ color: 'var(--nx-ink)' }}>No templates yet</p>
              <p className="text-sm mt-1 mb-6" style={{ color: 'var(--nx-ink-muted)' }}>
                {canEdit ? 'Create your first template to get started.' : 'No templates are available.'}
              </p>
              {canEdit && (
                <Button onClick={() => navigate('/templates/new')}>
                  <Plus className="h-4 w-4" />
                  Create Template
                </Button>
              )}
            </Card>
          )}

          {!loading && templates.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((t) => (
                <Card
                  key={t.id}
                  className="cursor-pointer p-5 transition-colors hover:bg-[var(--nx-surface)]"
                  onClick={() => navigate(canEdit ? `/templates/${t.id}/edit` : `/templates/${t.id}/fill`)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--nx-radius-sm)]"
                      style={{ background: 'var(--nx-surface)' }}
                    >
                      <FileText className="h-4 w-4" style={{ color: 'var(--nx-ink-muted)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--nx-ink)' }}>{t.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--nx-ink-muted)' }}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-[var(--nx-radius-sm)] text-[11px] font-medium"
                      style={{ background: 'var(--nx-surface)', color: 'var(--nx-ink-secondary)' }}
                    >
                      {t.updated_at ? 'Edited' : 'New'}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
