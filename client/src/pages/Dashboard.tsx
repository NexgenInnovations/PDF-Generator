import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden group">
      {/* Gradient accent line top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, #0057FF, #00CFFF, transparent)' }}
      />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold tracking-widest uppercase text-[#A0B4CC]">
          {title}
        </CardTitle>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg, rgba(0,87,255,0.25), rgba(0,207,255,0.15))', border: '1px solid rgba(0,207,255,0.20)' }}
        >
          <span className="text-[#00CFFF] [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-white">{value}</div>
        {description && <p className="text-xs text-[#A0B4CC]/70 mt-1">{description}</p>}
      </CardContent>
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
            <h2
              className="text-base font-bold tracking-tight"
              style={{
                background: 'linear-gradient(90deg, #FFFFFF, #A0B4CC)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Recent Templates
            </h2>
            <button
              onClick={() => navigate('/templates')}
              className="text-xs font-semibold text-[#A0B4CC] hover:text-[#00CFFF] transition-colors"
              style={{ letterSpacing: '0.05em' }}
            >
              View all →
            </button>
          </div>

          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-5 space-y-3">
                    <div className="h-3 rounded bg-[rgba(255,255,255,0.06)] w-2/3" />
                    <div className="h-2.5 rounded bg-[rgba(255,255,255,0.04)] w-1/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && templates.length === 0 && (
            <Card
              className="border-dashed"
              style={{ borderColor: 'rgba(0,207,255,0.15)', background: 'rgba(0,87,255,0.04)' }}
            >
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-xl mb-4"
                  style={{ background: 'linear-gradient(135deg, rgba(0,87,255,0.20), rgba(0,207,255,0.10))', border: '1px solid rgba(0,207,255,0.20)' }}
                >
                  <FileText className="h-6 w-6 text-[#00CFFF]" />
                </div>
                <p className="text-sm font-semibold text-white">No templates yet</p>
                <p className="text-xs text-[#A0B4CC] mt-1 mb-6">
                  {canEdit ? 'Create your first template to get started.' : 'No templates are available.'}
                </p>
                {canEdit && (
                  <button
                    onClick={() => navigate('/templates/new')}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110"
                    style={{ background: 'linear-gradient(135deg, #0057FF, #00CFFF)', boxShadow: '0 0 14px rgba(0,207,255,0.35)' }}
                  >
                    <Plus className="h-4 w-4" />
                    Create Template
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {!loading && templates.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((t) => (
                <Card
                  key={t.id}
                  className="cursor-pointer group"
                  onClick={() => navigate(canEdit ? `/templates/${t.id}/edit` : `/templates/${t.id}/fill`)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: 'linear-gradient(135deg, rgba(0,87,255,0.25), rgba(0,207,255,0.15))', border: '1px solid rgba(0,207,255,0.20)' }}
                      >
                        <FileText className="h-4 w-4 text-[#00CFFF]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-white truncate group-hover:text-[#00CFFF] transition-colors">{t.name}</p>
                        <p className="text-xs text-[#A0B4CC]/70 mt-0.5">
                          {new Date(t.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={t.updated_at ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                        {t.updated_at ? 'Edited' : 'New'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
