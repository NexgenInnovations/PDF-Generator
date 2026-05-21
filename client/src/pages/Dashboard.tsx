import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';

const BLOCK_COLORS = ['#dceeb1', '#c5b0f4', '#f4ecd6', '#c8e6cd', '#efd4d4', '#f3c9b6'];

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  color: string;
}

function StatCard({ title, value, icon, description, color }: StatCardProps) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-4"
      style={{ background: color }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-medium tracking-widest uppercase"
          style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.50)' }}
        >
          {title}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10">
          <span className="text-black/70 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        </div>
      </div>
      <div>
        <div className="text-4xl font-bold text-black tracking-tight" style={{ letterSpacing: '-0.02em' }}>{value}</div>
        {description && (
          <p
            className="text-xs mt-1"
            style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.45)' }}
          >
            {description}
          </p>
        )}
      </div>
    </div>
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
            color="#dceeb1"
          />
          <StatCard
            title="Recent Activity"
            value={loading ? '—' : recent.length}
            icon={<TrendingUp />}
            description="Last 7 days"
            color="#c5b0f4"
          />
          <StatCard
            title="Your Role"
            value={role}
            icon={<CheckCircle />}
            description="Current session"
            color="#f4ecd6"
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
            color="#c8e6cd"
          />
        </div>

        {/* Recent templates */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-black" style={{ letterSpacing: '-0.02em' }}>
              Recent Templates
            </h2>
            <button
              onClick={() => navigate('/templates')}
              className="text-xs font-semibold text-black/50 hover:text-black transition-colors"
              style={{ fontFamily: "'Geist Mono', monospace", letterSpacing: '0.04em' }}
            >
              View all →
            </button>
          </div>

          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl p-6 space-y-3"
                  style={{ background: '#f7f7f5' }}
                >
                  <div className="h-3 rounded-full bg-black/10 w-2/3" />
                  <div className="h-2.5 rounded-full bg-black/6 w-1/3" />
                </div>
              ))}
            </div>
          )}

          {!loading && templates.length === 0 && (
            <div
              className="rounded-2xl p-12 flex flex-col items-center justify-center text-center"
              style={{ background: '#f7f7f5', border: '2px dashed #e6e6e6' }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/6 mb-4">
                <FileText className="h-6 w-6 text-black/40" />
              </div>
              <p className="text-base font-bold text-black">No templates yet</p>
              <p className="text-sm text-black/50 mt-1 mb-6">
                {canEdit ? 'Create your first template to get started.' : 'No templates are available.'}
              </p>
              {canEdit && (
                <button
                  onClick={() => navigate('/templates/new')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-black hover:bg-black/80 active:scale-[0.97] transition-all"
                  style={{ borderRadius: 50 }}
                >
                  <Plus className="h-4 w-4" />
                  Create Template
                </button>
              )}
            </div>
          )}

          {!loading && templates.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((t, i) => (
                <div
                  key={t.id}
                  className="cursor-pointer rounded-2xl p-5 transition-all duration-150 hover:scale-[1.01]"
                  style={{ background: BLOCK_COLORS[i % BLOCK_COLORS.length] }}
                  onClick={() => navigate(canEdit ? `/templates/${t.id}/edit` : `/templates/${t.id}/fill`)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10">
                      <FileText className="h-4 w-4 text-black/60" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-black truncate" style={{ letterSpacing: '-0.01em' }}>{t.name}</p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.45)' }}
                      >
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/10 text-black/60"
                    >
                      {t.updated_at ? 'Edited' : 'New'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
