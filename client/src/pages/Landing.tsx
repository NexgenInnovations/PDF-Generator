import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  LayoutTemplate,
  PenLine,
  ListChecks,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';

const steps = [
  {
    icon: LayoutTemplate,
    title: 'Design',
    description: 'Build a template with the drag-and-drop editor — text, tables, letterheads, dividers.',
    screenshot: '/landing/designer-canvas.png',
    screenshotPosition: '20% 15%',
  },
  {
    icon: PenLine,
    title: 'Fill & sign',
    description: 'Share it as a live form. Fill it in, then click to place a signature before sending.',
    screenshot: '/landing/signed-form.png',
    screenshotPosition: '60% 15%',
  },
  {
    icon: ListChecks,
    title: 'Track',
    description: 'Every submission lands in one place — draft, submitted, or completed.',
    screenshot: '/landing/dashboard.png',
    screenshotPosition: 'center 75%',
  },
];

const features = [
  {
    icon: LayoutTemplate,
    title: 'Template designer',
    description: 'Dynamic PDF templates with tables, letterheads, and reusable fields — no code required.',
  },
  {
    icon: PenLine,
    title: 'Form fill + e-signature',
    description: 'Fill a shared form and click to place a signature directly on the document.',
  },
  {
    icon: ListChecks,
    title: 'Submissions tracking',
    description: 'See every document in one place, so nothing gets lost between teams.',
  },
  {
    icon: ShieldCheck,
    title: 'Roles & permissions',
    description: 'Admins and Designers manage templates; everyone else fills and signs.',
  },
];

const faqs = [
  {
    question: 'What does "self-attested" e-signature mean?',
    answer:
      "When someone signs a document in NexGen PDF Manager, their signature and the surrounding action are recorded in an audit trail tied to that submission. It's a self-attested signature, not a third-party-certified digital signature — useful for internal workflows and approvals rather than contexts that require certified digital signing.",
  },
  {
    question: "What's the difference between Admin, Designer, and other roles?",
    answer:
      "Admins and Designers can create and manage document templates. Everyone else can fill out forms and add their signature, and see the status of documents they're involved in.",
  },
  {
    question: 'Do I need to write code to build a template?',
    answer: 'No. Templates are built with a drag-and-drop editor — you add text, tables, letterheads, and dividers visually.',
  },
  {
    question: "Where do submissions go after they're signed?",
    answer:
      'Every submission lands in one place, showing its status as draft, submitted, or completed, so nothing gets lost between teams.',
  },
];

const cardShadow = '0 12px 32px -12px rgba(10,37,64,0.14)';

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ background: 'var(--nx-canvas)', color: 'var(--nx-ink)' }} className="min-h-screen">
      {/* Header */}
      <header
        className={`sticky top-0 z-30 flex h-16 items-center gap-6 px-6 sm:px-10 transition-colors duration-200 ${
          scrolled ? 'bg-white/80 backdrop-blur' : 'bg-transparent'
        }`}
        style={{ borderBottom: scrolled ? '1px solid var(--nx-hairline)' : '1px solid transparent' }}
      >
        <div className="flex items-center gap-2 flex-1">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)]"
            style={{ background: 'var(--nx-accent-tint)' }}
          >
            <FileText className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
          </div>
          <span className="text-sm font-semibold tracking-tight">NexGen PDF Manager</span>
        </div>
        <nav className="hidden sm:flex items-center gap-6 text-sm font-medium" style={{ color: 'var(--nx-ink-secondary)' }}>
          <a href="#how-it-works" className="transition-colors hover:text-[var(--nx-ink)]">
            How it works
          </a>
          <a href="#features" className="transition-colors hover:text-[var(--nx-ink)]">
            Features
          </a>
          <a href="#faq" className="transition-colors hover:text-[var(--nx-ink)]">
            FAQ
          </a>
        </nav>
        <Button size="sm" onClick={() => navigate('/')}>
          Go to Dashboard
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </header>

      {/* Hero — asymmetric, not centered */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 right-[-8%] h-[440px] w-[440px] rounded-full blur-3xl"
          style={{ background: 'var(--nx-accent-tint)', opacity: 0.8 }}
        />
        <div className="relative px-6 sm:px-10 pt-16 pb-20 sm:pt-20 sm:pb-24 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center">
            {/* Copy */}
            <div>
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium mb-6"
                style={{ background: 'var(--nx-accent-tint)', color: 'var(--nx-accent)' }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Design, fill, sign, and track — all in one place
              </div>
              <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.05]">
                PDF documents, from template to signature
              </h1>
              <p className="mt-5 text-lg sm:text-xl max-w-lg" style={{ color: 'var(--nx-ink-secondary)' }}>
                NexGen PDF Manager gives your team a single workflow for building document
                templates, collecting filled-in forms and signatures, and tracking every
                submission to completion.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <Button size="lg" className="h-12 px-6 text-base" onClick={() => navigate('/')}>
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" className="h-12 px-6 text-base" variant="outline" onClick={() => navigate('/templates')}>
                  Browse templates
                </Button>
              </div>
            </div>

            {/* Visual — real dashboard screenshot in a browser-chrome frame */}
            <div className="relative mx-auto w-full max-w-sm">
              <div
                className="rounded-2xl border bg-white overflow-hidden"
                style={{ borderColor: 'var(--nx-hairline)', boxShadow: cardShadow }}
              >
                <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: 'var(--nx-hairline)' }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--nx-ink-muted)' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--nx-ink-muted)' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--nx-ink-muted)' }} />
                </div>
                <img
                  src="/landing/dashboard.png"
                  alt="NexGen PDF Manager dashboard"
                  className="block w-full aspect-[16/9] object-cover"
                />
              </div>
              <div
                className="absolute -bottom-5 -left-6 flex items-center gap-2.5 rounded-xl bg-white px-4 py-3"
                style={{ border: '1px solid var(--nx-hairline)', boxShadow: cardShadow }}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: 'var(--nx-accent-tint)' }}>
                  <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
                </div>
                <div>
                  <div className="text-xs font-semibold leading-tight">Submitted</div>
                  <div className="text-[11px]" style={{ color: 'var(--nx-ink-muted)' }}>Order Stream · 2 min ago</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — numbered flow with screenshot crops */}
      <section id="how-it-works" className="px-6 sm:px-10 pb-20 sm:pb-24 max-w-7xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-8 relative">
          <div
            aria-hidden
            className="hidden sm:block absolute top-5 left-[16.5%] right-[16.5%] h-px"
            style={{ background: 'var(--nx-hairline)' }}
          />
          {steps.map((step, i) => (
            <div key={step.title} className="relative flex flex-col items-center text-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold z-10"
                style={{ background: 'var(--nx-ink)', color: '#fff' }}
              >
                {i + 1}
              </div>
              <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
              <p className="text-sm max-w-[240px]" style={{ color: 'var(--nx-ink-secondary)' }}>
                {step.description}
              </p>
              <div
                className="w-full max-w-[240px] h-36 rounded-lg overflow-hidden mt-1"
                style={{ border: '1px solid var(--nx-hairline)' }}
              >
                <img
                  src={step.screenshot}
                  alt={`${step.title} screenshot`}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: step.screenshotPosition }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 sm:px-10 pb-20 sm:pb-24 max-w-7xl mx-auto">
        <div className="mb-10 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything the workflow needs</h2>
          <p className="mt-3 text-base sm:text-lg max-w-xl mx-auto" style={{ color: 'var(--nx-ink-secondary)' }}>
            One tool for the whole document lifecycle, scoped to the right role.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="p-6 flex flex-col gap-3 border-transparent shadow-[0_1px_2px_rgba(10,37,64,0.06)] hover:shadow-[0_12px_32px_-12px_rgba(10,37,64,0.14)] transition-shadow duration-200"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: 'var(--nx-accent-tint)' }}
              >
                <Icon className="h-5 w-5" style={{ color: 'var(--nx-accent)' }} />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--nx-ink-secondary)' }}>
                  {description}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-6 sm:px-10 pb-20 sm:pb-24 max-w-3xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center mb-10">
          Frequently asked questions
        </h2>
        <div className="flex flex-col">
          {faqs.map((faq, i) => (
            <div key={faq.question} className="py-6" style={i > 0 ? { borderTop: '1px solid var(--nx-hairline)' } : undefined}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--nx-ink)' }}>
                {faq.question}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--nx-ink-secondary)' }}>
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner — dark, for contrast against the rest of the page */}
      <section className="px-6 sm:px-10 pb-20 sm:pb-24 max-w-7xl mx-auto">
        <div
          className="relative overflow-hidden rounded-2xl px-8 py-14 sm:px-16 sm:py-16 text-center flex flex-col items-center gap-5"
          style={{ background: 'var(--nx-ink)' }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full blur-3xl"
            style={{ background: 'var(--nx-accent)', opacity: 0.22 }}
          />
          <h2 className="relative text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Ready to get started?
          </h2>
          <p className="relative text-base sm:text-lg max-w-md" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Jump into your dashboard to create a template, fill a form, or check on submissions.
          </p>
          <Button size="lg" className="relative h-12 px-7 text-base" onClick={() => navigate('/')}>
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-6 sm:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
        style={{ borderTop: '1px solid var(--nx-hairline)', color: 'var(--nx-ink-muted)' }}
      >
        <span>NexGen PDF Manager</span>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="transition-colors hover:text-[var(--nx-ink-secondary)]">
            Dashboard
          </button>
          <button onClick={() => navigate('/templates')} className="transition-colors hover:text-[var(--nx-ink-secondary)]">
            Templates
          </button>
        </div>
      </footer>
    </div>
  );
}
