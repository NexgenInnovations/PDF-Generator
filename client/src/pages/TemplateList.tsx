import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';

export default function TemplateList() {
  const { role } = useRole();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <div style={{ padding: 32 }}>Loading templates…</div>;
  if (error) return <div style={{ padding: 32, color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Templates</h1>
        {(role === 'Admin' || role === 'Designer') && (
          <button
            onClick={() => navigate('/templates/new')}
            style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            + Create Template
          </button>
        )}
      </div>

      {templates.length === 0 && <p>No templates yet.</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Created</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Updated</th>
            <th style={{ padding: '8px 12px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.name}</td>
              <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13 }}>
                {new Date(t.created_at).toLocaleDateString()}
              </td>
              <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13 }}>
                {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}
              </td>
              <td style={{ padding: '10px 12px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {role === 'FormFiller' && (
                  <Link
                    to={`/templates/${t.id}/fill`}
                    style={{ padding: '6px 12px', background: '#059669', color: '#fff', borderRadius: 5, textDecoration: 'none', fontSize: 13 }}
                  >
                    Fill
                  </Link>
                )}
                {(role === 'Admin' || role === 'Designer') && (
                  <Link
                    to={`/templates/${t.id}/edit`}
                    style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', borderRadius: 5, textDecoration: 'none', fontSize: 13 }}
                  >
                    Edit
                  </Link>
                )}
                {role === 'Admin' && (
                  <button
                    onClick={() => handleDelete(t.id)}
                    style={{ padding: '6px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13 }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
