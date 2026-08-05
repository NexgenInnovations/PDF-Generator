import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { TEMPLATE_GALLERY } from '../lib/templateGallery.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';

export default function TemplateGallery() {
  const navigate = useNavigate();
  const [activeIndustryId, setActiveIndustryId] = useState(TEMPLATE_GALLERY[0].id);
  const activeIndustry = TEMPLATE_GALLERY.find(i => i.id === activeIndustryId) ?? TEMPLATE_GALLERY[0];

  return (
    <AppLayout>
      <TopBar title="Template Gallery" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            Pick a starting point for your industry — the AI will build it with you.
          </p>
          <button
            onClick={() => navigate('/templates/new')}
            className="inline-flex items-center gap-1 text-sm font-medium"
            style={{ color: 'var(--nx-accent)' }}
          >
            Or start from a blank template
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {TEMPLATE_GALLERY.map(industry => (
            <button
              key={industry.id}
              onClick={() => setActiveIndustryId(industry.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150',
                activeIndustryId === industry.id
                  ? 'text-white'
                  : 'border hover:bg-[var(--nx-surface)]'
              )}
              style={
                activeIndustryId === industry.id
                  ? { background: 'var(--nx-accent)' }
                  : { borderColor: 'var(--nx-hairline)', color: 'var(--nx-ink-secondary)' }
              }
            >
              <industry.icon className="h-3.5 w-3.5" />
              {industry.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeIndustry.templates.map(template => (
            <Card
              key={template.id}
              className="p-5 flex flex-col gap-3 shadow-[0_1px_2px_rgba(10,37,64,0.06)] hover:shadow-[0_12px_32px_-12px_rgba(10,37,64,0.14)] transition-shadow duration-200"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: 'var(--nx-accent-tint)' }}
              >
                <activeIndustry.icon className="h-5 w-5" style={{ color: 'var(--nx-accent)' }} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold tracking-tight" style={{ color: 'var(--nx-ink)' }}>
                  {template.name}
                </h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--nx-ink-secondary)' }}>
                  {template.description}
                </p>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => navigate('/templates/new', { state: { seedPrompt: template.seedPrompt } })}
              >
                Use this template
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
