import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, FileText, Grid, List, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../components/ui/tooltip.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';

function Skeleton() {
  return (
    <div
      className="animate-pulse rounded-[var(--nx-radius-md)] border p-5 space-y-3"
      style={{ background: 'var(--nx-surface)', borderColor: 'var(--nx-hairline)' }}
    >
      <div className="h-3.5 rounded w-3/4" style={{ background: 'var(--nx-hairline)' }} />
      <div className="h-2.5 rounded w-1/2" style={{ background: 'var(--nx-hairline)' }} />
      <div className="flex gap-2 pt-1">
        <div className="h-7 rounded w-16" style={{ background: 'var(--nx-hairline)' }} />
        <div className="h-7 rounded w-16" style={{ background: 'var(--nx-hairline)' }} />
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
          <span className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </span>

          <div
            className="flex items-center gap-1 rounded-[var(--nx-radius-sm)] p-1"
            style={{ background: 'var(--nx-surface)', border: '1px solid var(--nx-hairline)' }}
          >
            {([['grid', Grid], ['list', List]] as const).map(([mode, Icon]) => (
              <TooltipProvider key={mode} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setViewMode(mode)}
                      className="flex h-7 w-7 items-center justify-center rounded-[var(--nx-radius-sm)] transition-colors duration-150"
                      style={viewMode === mode ? {
                        background: 'var(--nx-accent-tint)',
                        color: 'var(--nx-accent)',
                      } : { color: 'var(--nx-ink-muted)' }}
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
            className="flex items-center gap-2 rounded-[var(--nx-radius-md)] px-4 py-3 text-sm"
            style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
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
          <Card className="p-16 flex flex-col items-center justify-center text-center border-dashed">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full mb-5"
              style={{ background: 'var(--nx-surface)' }}
            >
              <FileText className="h-7 w-7" style={{ color: 'var(--nx-ink-muted)' }} />
            </div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--nx-ink)' }}>No templates yet</h3>
            <p className="text-sm mt-1.5 mb-6" style={{ color: 'var(--nx-ink-muted)' }}>
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

        {/* Grid view */}
        {!loading && !error && templates.length > 0 && viewMode === 'grid' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--nx-radius-sm)]"
                      style={{ background: 'var(--nx-accent-tint)' }}
                    >
                      <FileText className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--nx-ink)' }}>{t.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--nx-ink-muted)' }}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  className="px-5 py-3 flex gap-2 items-center"
                  style={{ borderTop: '1px solid var(--nx-hairline)' }}
                >
                  {canFill && (
                    <Link to={`/templates/${t.id}/fill`} className="flex-1">
                      <Button size="sm" className="w-full">Fill Form</Button>
                    </Link>
                  )}
                  {canEdit && (
                    <Link to={`/templates/${t.id}/edit`} className="flex-1">
                      <Button size="sm" variant="secondary" className="w-full">
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </Button>
                    </Link>
                  )}
                  {canDelete && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 hover:text-[var(--nx-destructive)]"
                            onClick={() => handleDelete(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete template</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* List view */}
        {!loading && !error && templates.length > 0 && viewMode === 'list' && (
          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--nx-surface)', borderBottom: '1px solid var(--nx-hairline)' }}>
                  <th className="text-left px-5 py-3 text-xs font-medium" style={{ color: 'var(--nx-ink-muted)' }}>Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium" style={{ color: 'var(--nx-ink-muted)' }}>Created</th>
                  <th className="text-left px-5 py-3 text-xs font-medium" style={{ color: 'var(--nx-ink-muted)' }}>Updated</th>
                  <th className="px-5 py-3 text-xs font-medium text-right" style={{ color: 'var(--nx-ink-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t, i) => (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: i < templates.length - 1 ? '1px solid var(--nx-hairline)' : 'none',
                    }}
                    className="hover:bg-[var(--nx-surface)] transition-colors"
                  >
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--nx-ink)' }}>{t.name}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: 'var(--nx-ink-muted)' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: 'var(--nx-ink-muted)' }}>{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {canFill && (
                          <Link to={`/templates/${t.id}/fill`}>
                            <Button size="sm">Fill</Button>
                          </Link>
                        )}
                        {canEdit && (
                          <Link to={`/templates/${t.id}/edit`}>
                            <Button size="sm" variant="secondary">
                              <Edit2 className="h-3 w-3" />
                              Edit
                            </Button>
                          </Link>
                        )}
                        {canDelete && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="hover:text-[var(--nx-destructive)]"
                            onClick={() => handleDelete(t.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
