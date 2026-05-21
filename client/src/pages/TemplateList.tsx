import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, FileText, Grid, List, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../components/ui/tooltip.js';

const BLOCK_COLORS = ['#dceeb1', '#c5b0f4', '#f4ecd6', '#c8e6cd', '#efd4d4', '#f3c9b6'];

function Skeleton() {
  return (
    <div className="animate-pulse rounded-2xl p-5 space-y-3" style={{ background: '#f7f7f5' }}>
      <div className="h-3.5 rounded-full bg-black/10 w-3/4" />
      <div className="h-2.5 rounded-full bg-black/6 w-1/2" />
      <div className="flex gap-2 pt-1">
        <div className="h-7 rounded-full bg-black/10 w-16" />
        <div className="h-7 rounded-full bg-black/6 w-16" />
      </div>
    </div>
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
          <span
            className="text-[10px] font-medium tracking-widest uppercase"
            style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.40)' }}
          >
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </span>

          <div
            className="flex items-center gap-1 rounded-full p-1"
            style={{ background: '#f7f7f5', border: '1px solid #e6e6e6' }}
          >
            {([['grid', Grid], ['list', List]] as const).map(([mode, Icon]) => (
              <TooltipProvider key={mode} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewMode(mode)}
                      className="flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150"
                      style={viewMode === mode ? {
                        background: '#000',
                        color: '#fff',
                      } : { color: 'rgba(0,0,0,0.40)' }}
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
            className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-red-700"
            style={{ background: '#efd4d4', border: '1px solid rgba(239,68,68,0.20)' }}
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
          <div
            className="rounded-2xl p-16 flex flex-col items-center justify-center text-center"
            style={{ background: '#f7f7f5', border: '2px dashed #e6e6e6' }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/6 mb-5">
              <FileText className="h-7 w-7 text-black/40" />
            </div>
            <h3 className="text-base font-bold text-black">No templates yet</h3>
            <p className="text-sm text-black/50 mt-1.5 mb-6">
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

        {/* Grid view */}
        {!loading && !error && templates.length > 0 && viewMode === 'grid' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t, i) => (
              <div
                key={t.id}
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid #e6e6e6', background: '#fff' }}
              >
                <div
                  className="p-5"
                  style={{ background: BLOCK_COLORS[i % BLOCK_COLORS.length] }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10">
                      <FileText className="h-4 w-4 text-black/60" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-black truncate" style={{ letterSpacing: '-0.01em' }}>{t.name}</p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.45)' }}
                      >
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-3 flex gap-2 items-center" style={{ borderTop: '1px solid #e6e6e6' }}>
                  {canFill && (
                    <Link
                      to={`/templates/${t.id}/fill`}
                      className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold text-white bg-black hover:bg-black/80 transition-all"
                      style={{ borderRadius: 50 }}
                    >
                      Fill Form
                    </Link>
                  )}
                  {canEdit && (
                    <Link
                      to={`/templates/${t.id}/edit`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-black hover:bg-black/6 transition-all"
                      style={{ borderRadius: 50, border: '1px solid #e6e6e6' }}
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
                            className="flex h-7 w-7 items-center justify-center rounded-full text-black/30 hover:text-red-600 hover:bg-red-50 transition-all"
                            style={{ border: '1px solid #e6e6e6' }}
                            onClick={() => handleDelete(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Delete template</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List view */}
        {!loading && !error && templates.length > 0 && viewMode === 'list' && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid #e6e6e6' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#f7f7f5', borderBottom: '1px solid #e6e6e6' }}>
                  <th className="text-left px-5 py-3 text-[10px] font-medium tracking-widest uppercase" style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.40)' }}>Name</th>
                  <th className="text-left px-5 py-3 text-[10px] font-medium tracking-widest uppercase" style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.40)' }}>Created</th>
                  <th className="text-left px-5 py-3 text-[10px] font-medium tracking-widest uppercase" style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.40)' }}>Updated</th>
                  <th className="px-5 py-3 text-[10px] font-medium tracking-widest uppercase text-right" style={{ fontFamily: "'Geist Mono', monospace", color: 'rgba(0,0,0,0.40)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t, i) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: i < templates.length - 1 ? '1px solid #f1f1f1' : 'none',
                    }}
                    className="hover:bg-[#f7f7f5] transition-colors"
                  >
                    <td className="px-5 py-3 font-semibold text-black">{t.name}</td>
                    <td className="px-5 py-3 text-xs text-black/50" style={{ fontFamily: "'Geist Mono', monospace" }}>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-xs text-black/50" style={{ fontFamily: "'Geist Mono', monospace" }}>{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {canFill && (
                          <Link
                            to={`/templates/${t.id}/fill`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-black hover:bg-black/80 transition-all"
                            style={{ borderRadius: 50 }}
                          >
                            Fill
                          </Link>
                        )}
                        {canEdit && (
                          <Link
                            to={`/templates/${t.id}/edit`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-black hover:bg-black/6 transition-colors"
                            style={{ borderRadius: 50, border: '1px solid #e6e6e6' }}
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition-all"
                            style={{ borderRadius: 50, border: '1px solid rgba(239,68,68,0.20)' }}
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
