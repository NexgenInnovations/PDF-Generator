import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, FileText, Grid, List, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Badge } from '../components/ui/badge.js';
import { Card, CardContent, CardFooter } from '../components/ui/card.js';
import { Separator } from '../components/ui/separator.js';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../components/ui/tooltip.js';

function Skeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-5 space-y-3">
        <div className="h-3.5 rounded bg-[rgba(255,255,255,0.06)] w-3/4" />
        <div className="h-2.5 rounded bg-[rgba(255,255,255,0.04)] w-1/2" />
      </CardContent>
      <CardFooter className="px-5 pb-4 pt-0 gap-2">
        <div className="h-7 rounded-lg bg-[rgba(255,255,255,0.06)] w-16" />
        <div className="h-7 rounded-lg bg-[rgba(255,255,255,0.04)] w-16" />
      </CardFooter>
    </Card>
  );
}

export default function TemplateList() {
  const { role } = useRole();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    api.listTemplates()
      .then(setTemplates)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    await api.deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const canEdit = role === 'Admin' || role === 'Designer';
  const canDelete = role === 'Admin';
  const canFill = role === 'FormFiller';

  return (
    <AppLayout>
      <TopBar
        title="Templates"
        ctaLabel={canEdit ? '+ New Template' : undefined}
        onCtaClick={canEdit ? () => navigate('/templates/new') : undefined}
      />

      <div className="p-6 space-y-5">
        {/* Filter bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {templates.length} template{templates.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <div
            className="flex items-center gap-1 rounded-lg p-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,207,255,0.12)' }}
          >
            {([['grid', Grid], ['list', List]] as const).map(([mode, Icon]) => (
              <TooltipProvider key={mode} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewMode(mode)}
                      className="flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150"
                      style={viewMode === mode ? {
                        background: 'linear-gradient(135deg, #0057FF, #00CFFF)',
                        boxShadow: '0 0 8px rgba(0,207,255,0.30)',
                        color: '#fff',
                      } : { color: '#A0B4CC' }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{mode === 'grid' ? 'Grid view' : 'List view'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-red-400"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className={viewMode === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && templates.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl mb-5"
              style={{ background: 'linear-gradient(135deg, rgba(0,87,255,0.20), rgba(0,207,255,0.10))', border: '1px solid rgba(0,207,255,0.20)' }}
            >
              <FileText className="h-7 w-7 text-[#00CFFF]" />
            </div>
            <h3 className="text-base font-bold text-white">No templates yet</h3>
            <p className="text-sm text-[#A0B4CC] mt-1.5 mb-6">
              {canEdit ? 'Create your first template to get started.' : 'No templates are available.'}
            </p>
            {canEdit && (
              <button
                onClick={() => navigate('/templates/new')}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #0057FF, #00CFFF)', boxShadow: '0 0 14px rgba(0,207,255,0.35)' }}
              >
                <Plus className="h-4 w-4" />
                Create Template
              </button>
            )}
          </div>
        )}

        {/* Grid view */}
        {!loading && !error && templates.length > 0 && viewMode === 'grid' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="group">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'linear-gradient(135deg, rgba(0,87,255,0.25), rgba(0,207,255,0.15))', border: '1px solid rgba(0,207,255,0.20)' }}
                    >
                      <FileText className="h-4 w-4 text-[#00CFFF]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-white truncate group-hover:text-[#00CFFF] transition-colors">{t.name}</p>
                      <p className="text-xs text-[#A0B4CC]/70 mt-0.5">
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
                <Separator />
                <CardFooter className="px-5 py-3 gap-2">
                  {canFill && (
                    <Link
                      to={`/templates/${t.id}/fill`}
                      className="flex-1 inline-flex items-center justify-center rounded-lg py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: 'linear-gradient(135deg, #0057FF, #00CFFF)', boxShadow: '0 0 10px rgba(0,207,255,0.25)' }}
                    >
                      Fill Form
                    </Link>
                  )}
                  {canEdit && (
                    <Link
                      to={`/templates/${t.id}/edit`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-[#A0B4CC] hover:text-white transition-all"
                      style={{ border: '1px solid rgba(0,207,255,0.20)', background: 'rgba(0,207,255,0.04)' }}
                    >
                      <Edit2 className="h-3 w-3" />
                      Edit
                    </Link>
                  )}
                  {canDelete && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#A0B4CC]/50 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                            onClick={() => handleDelete(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Delete template</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* List view */}
        {!loading && !error && templates.length > 0 && viewMode === 'list' && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(0,207,255,0.12)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(0,87,255,0.08)', borderBottom: '1px solid rgba(0,207,255,0.10)' }}>
                  <th className="text-left px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-[#A0B4CC]/70">Name</th>
                  <th className="text-left px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-[#A0B4CC]/70">Created</th>
                  <th className="text-left px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-[#A0B4CC]/70">Updated</th>
                  <th className="px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-[#A0B4CC]/70 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t, i) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: i < templates.length - 1 ? '1px solid rgba(0,207,255,0.06)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(0,87,255,0.03)',
                    }}
                    className="hover:bg-[rgba(0,207,255,0.04)] transition-colors"
                  >
                    <td className="px-5 py-3 font-semibold text-white">{t.name}</td>
                    <td className="px-5 py-3 text-[#A0B4CC]/70 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-[#A0B4CC]/70 text-xs">{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {canFill && (
                          <Link
                            to={`/templates/${t.id}/fill`}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                            style={{ background: 'linear-gradient(135deg, #0057FF, #00CFFF)', boxShadow: '0 0 8px rgba(0,207,255,0.20)' }}
                          >
                            Fill
                          </Link>
                        )}
                        {canEdit && (
                          <Link
                            to={`/templates/${t.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#A0B4CC] hover:text-white transition-colors"
                            style={{ border: '1px solid rgba(0,207,255,0.20)', background: 'rgba(0,207,255,0.04)' }}
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            style={{ border: '1px solid rgba(239,68,68,0.15)' }}
                            onClick={() => handleDelete(t.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
