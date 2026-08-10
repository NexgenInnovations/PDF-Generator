import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FileText, Plus, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.js';
import type { TemplateSummary } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';
import { startProductTour, TOUR_ANCHORS } from '../lib/productTour.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface StatCellProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  index: number;
}

function StatCell({ label, value, icon, index }: StatCellProps) {
  return (
    <div
      className={cn(
        'p-5 flex items-center gap-3',
        index % 2 === 1 && 'border-l',
        index >= 2 && 'border-t sm:border-t-0',
        index > 0 && 'sm:border-l'
      )}
      style={{ borderColor: 'var(--nx-hairline)' }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--nx-accent-tint)' }}
      >
        <span style={{ color: 'var(--nx-accent)' }} className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold tracking-tight truncate" style={{ color: 'var(--nx-ink)' }}>{value}</div>
        <div className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Starts the guided tour when routed here with `startTour` in location state.
  // The state is cleared immediately so a page reload doesn't replay the tour.
  useEffect(() => {
    const shouldStartTour = Boolean((location.state as { startTour?: boolean } | null)?.startTour);
    if (!shouldStartTour) return;
    navigate(location.pathname + location.search + location.hash, { replace: true, state: null });
    if (role) startProductTour(role);
  }, [location.state, location.pathname, location.search, location.hash, navigate, role]);

  const canEdit = role === 'Admin' || role === 'Designer';
  const recent = templates.slice(0, 6);

  const updatedThisWeek = templates.filter(t => {
    const ts = t.updated_at ?? t.created_at;
    return ts && Date.now() - new Date(ts).getTime() <= WEEK_MS;
  }).length;

  const lastUpdated = (() => {
    const t = templates.find(x => x.updated_at);
    return t?.updated_at ? new Date(t.updated_at).toLocaleDateString() : 'Never';
  })();

  return (
    <AppLayout>
      <TopBar
        title="Dashboard"
        ctaLabel={canEdit ? '+ New Template' : undefined}
        onCtaClick={canEdit ? () => navigate('/templates/new') : undefined}
      />

      <div className="p-6 space-y-8">
        {/* Stats strip — one grouped surface instead of four repeated cards */}
        <Card className="overflow-hidden" data-tour={TOUR_ANCHORS.dashboardStats}>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <StatCell index={0} label="Total templates" value={loading ? '—' : templates.length} icon={<FileText />} />
            <StatCell index={1} label="Updated this week" value={loading ? '—' : updatedThisWeek} icon={<TrendingUp />} />
            <StatCell index={2} label="Your role" value={role ?? '—'} icon={<CheckCircle />} />
            <StatCell index={3} label="Last updated" value={loading ? '—' : lastUpdated} icon={<Clock />} />
          </div>
        </Card>

        {/* Recent templates */}
        <div data-tour={TOUR_ANCHORS.dashboardRecent}>
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
            <Card
              className="p-12 flex flex-col items-center justify-center text-center"
              style={{ borderStyle: 'dashed', borderColor: 'var(--nx-accent)', background: 'var(--nx-surface)' }}
            >
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full mb-4"
                style={{ background: 'var(--nx-accent-tint)' }}
              >
                <FileText className="h-6 w-6" style={{ color: 'var(--nx-accent)' }} />
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
                  className="cursor-pointer p-5 shadow-[0_1px_2px_rgba(10,37,64,0.06)] hover:shadow-[0_12px_32px_-12px_rgba(10,37,64,0.14)] active:scale-[0.99] transition-[box-shadow,transform] duration-150"
                  onClick={() => navigate(canEdit ? `/templates/${t.id}/edit` : `/templates/${t.id}/fill`)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'var(--nx-accent-tint)' }}
                    >
                      <FileText className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--nx-ink)' }}>{t.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--nx-ink-muted)' }}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-[var(--nx-radius-sm)] text-[11px] font-medium"
                      style={
                        t.updated_at
                          ? { background: 'var(--nx-surface)', color: 'var(--nx-ink-secondary)' }
                          : { background: 'var(--nx-accent-tint)', color: 'var(--nx-accent)' }
                      }
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
