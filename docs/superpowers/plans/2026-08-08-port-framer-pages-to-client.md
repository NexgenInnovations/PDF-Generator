# Port Framer Landing + Waitlist Pages into client/src Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the published Framer landing page and waitlist page as real React components in `client/src`, matching content and layout exactly, so the marketing site no longer depends on Framer hosting.

**Architecture:** Two page components (`client/src/pages/Landing.tsx` rebuilt in place, `client/src/pages/Waitlist.tsx` new), reusing existing `components/ui/` primitives, the existing `client/src/lib/api.ts` request pattern, and existing CSS custom properties (`--nx-*`) from `client/src/index.css`. No new dependencies.

**Tech Stack:** React, react-router-dom, Tailwind CSS + CSS custom properties, existing `client/src/lib/api.ts` fetch wrapper.

## Global Constraints

- No new npm dependencies (no accordion/toast library) — reuse `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/card.tsx`.
- `client/src/pages/Landing.tsx` stays mounted at the existing `/welcome` route (`client/src/App.tsx:38`) — do not change that route.
- New `/waitlist` route added following the existing lazy-loaded pattern in `client/src/App.tsx`.
- Waitlist form calls the real backend via a new `api.submitWaitlist` entry in `client/src/lib/api.ts`, going through the existing `/api` proxy (`client/vite.config.ts`) — no new env var.
- This package has no automated test framework (confirmed: `client/package.json` has no `test` script). Verification is `tsc` type-checking plus visual comparison against the live Framer site (https://considerate-tone-972589.framer.app) via the browser preview tools — not unit tests.
- Screenshot assets already exist locally at `/private/tmp/claude-501/-Users-achintha-Desktop-Nexgen-PDF-generator-/04cb7922-92a7-4a89-b372-c278040228e7/scratchpad/landing-assets/{dashboard,designer-canvas,signed-form}.png` (1600×900 each) — copy them, do not re-capture.
- FAQ copy, hero copy, step copy, and feature copy must match the live Framer site verbatim (character-for-character) except where this plan explicitly calls for a wording adaptation (e.g. "Go to Dashboard" link targets).

---

### Task 1: Rebuild the Landing page

**Files:**
- Create directory + copy assets: `client/public/landing/dashboard.png`, `client/public/landing/designer-canvas.png`, `client/public/landing/signed-form.png`
- Modify: `client/src/pages/Landing.tsx` (full rewrite, 257 lines → replaced in full)

**Interfaces:**
- Consumes: `Button` from `client/src/components/ui/button.js`, `Card` from `client/src/components/ui/card.js`, `useNavigate` from `react-router-dom`, CSS vars from `client/src/index.css` (`--nx-canvas`, `--nx-ink`, `--nx-ink-secondary`, `--nx-ink-muted`, `--nx-accent`, `--nx-accent-tint`, `--nx-hairline`, `--nx-radius-sm`).
- Produces: the `/welcome` route's rendered output, with section ids `how-it-works`, `features`, `faq` that Task 1 itself both defines and links to (self-contained — no other task depends on these ids).

- [ ] **Step 1: Copy the screenshot assets**

```bash
mkdir -p "client/public/landing"
cp "/private/tmp/claude-501/-Users-achintha-Desktop-Nexgen-PDF-generator-/04cb7922-92a7-4a89-b372-c278040228e7/scratchpad/landing-assets/dashboard.png" "client/public/landing/dashboard.png"
cp "/private/tmp/claude-501/-Users-achintha-Desktop-Nexgen-PDF-generator-/04cb7922-92a7-4a89-b372-c278040228e7/scratchpad/landing-assets/designer-canvas.png" "client/public/landing/designer-canvas.png"
cp "/private/tmp/claude-501/-Users-achintha-Desktop-Nexgen-PDF-generator-/04cb7922-92a7-4a89-b372-c278040228e7/scratchpad/landing-assets/signed-form.png" "client/public/landing/signed-form.png"
```

- [ ] **Step 2: Replace `client/src/pages/Landing.tsx` in full**

```tsx
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
```

- [ ] **Step 3: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Visual verification against the live Framer site**

Start the client dev server (`npm --prefix client run dev`, or via the project's `preview_start` browser tooling with the `client` launch config) and navigate to `http://localhost:5173/welcome`. Open a second tab at `https://considerate-tone-972589.framer.app` for comparison. Check, section by section:
- Nav: at the top of the page the header background should be transparent; scroll down ~20px and confirm it gains a white/blurred background and a bottom border, matching the Framer nav's scroll behavior.
- Nav anchor links: click "How it works", "Features", "FAQ" — each should smooth-scroll to the matching section.
- Hero: dashboard screenshot renders inside the browser-chrome frame (three dots visible above it), the "Submitted" badge overlaps its bottom-left corner.
- How It Works: each of the 3 screenshot crops is legible (not a blank/mostly-empty crop) — adjust the `screenshotPosition` values in the `steps` array if a crop looks wrong (e.g. shows empty space instead of the relevant UI), then re-check.
- FAQ: all 4 questions/answers render, separated by hairline dividers (no divider above the first).
- Footer: "Dashboard" and "Templates" links are present and clickable.

- [ ] **Step 5: Commit**

```bash
git add client/public/landing client/src/pages/Landing.tsx
git commit -m "feat(client): rebuild landing page to match published Framer site"
```

---

### Task 2: Add the Waitlist page

**Files:**
- Modify: `client/src/lib/api.ts` (add one entry to the `api` object)
- Create: `client/src/pages/Waitlist.tsx`
- Modify: `client/src/App.tsx` (add lazy import + route)

**Interfaces:**
- Consumes: `request<T>` (internal to `api.ts`, already defined at `client/src/lib/api.ts:44`), `Button`/`Input` from `components/ui/`, `Task 1`'s Landing page only via the `/welcome` link target (no code dependency).
- Produces: `api.submitWaitlist(name: string, email: string): Promise<{ alreadyOnList: boolean }>`, used only within this task's own `Waitlist.tsx`.

- [ ] **Step 1: Add `submitWaitlist` to `client/src/lib/api.ts`**

Add this entry to the `api` object (e.g. right after `listSubmissions` at the end):

```ts
  submitWaitlist: (name: string, email: string) =>
    request<{ alreadyOnList: boolean }>("/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    }),
```

- [ ] **Step 2: Create `client/src/pages/Waitlist.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { api } from '../lib/api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error';

export default function Waitlist() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (name.trim().length === 0) {
      setValidationError('Please enter your name.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setValidationError('Please enter a valid email address.');
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    setStatus('submitting');

    try {
      const result = await api.submitWaitlist(name.trim(), email.trim());
      setStatus(result.alreadyOnList ? 'duplicate' : 'success');
    } catch (err) {
      setSubmitError((err as Error).message);
      setStatus('error');
    }
  };

  return (
    <div style={{ background: 'var(--nx-canvas)', color: 'var(--nx-ink)' }} className="min-h-screen">
      <header className="flex h-16 items-center px-6 sm:px-10">
        <button
          onClick={() => navigate('/welcome')}
          className="flex items-center gap-2"
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)]"
            style={{ background: 'var(--nx-accent-tint)' }}
          >
            <FileText className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
          </div>
          <span className="text-sm font-semibold tracking-tight">NexGen PDF Manager</span>
        </button>
      </header>

      <main className="flex flex-col items-center px-6 sm:px-10 pt-16 pb-24 text-center">
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium mb-6"
          style={{ background: 'var(--nx-accent-tint)', color: 'var(--nx-accent)' }}
        >
          Coming soon
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] max-w-2xl">
          Get early access to what's next
        </h1>
        <p className="mt-5 text-lg max-w-lg" style={{ color: 'var(--nx-ink-secondary)' }}>
          We're building new plans and features for NexGen PDF Manager — join the waitlist to be
          the first to know, and get early access when they launch.
        </p>

        <div className="mt-10 w-full max-w-sm">
          {status === 'success' || status === 'duplicate' ? (
            <p className="text-base font-semibold" style={{ color: 'var(--nx-ink)' }}>
              {status === 'success'
                ? "You're on the list — we'll be in touch."
                : "You're already on the list!"}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
              <label className="sr-only" htmlFor="waitlist-name">Name</label>
              <Input
                id="waitlist-name"
                placeholder="Name"
                value={name}
                disabled={status === 'submitting'}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="sr-only" htmlFor="waitlist-email">Email</label>
              <Input
                id="waitlist-email"
                type="email"
                placeholder="Email"
                value={email}
                disabled={status === 'submitting'}
                onChange={(e) => setEmail(e.target.value)}
              />
              {validationError && (
                <div
                  className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
                  style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}
              {status === 'error' && submitError && (
                <div
                  className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
                  style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
              <Button type="submit" size="lg" className="h-12 text-base" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
                {status !== 'submitting' && <CheckCircle2 className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Wire the route in `client/src/App.tsx`**

Add the lazy import alongside the others (after `const Landing = lazy(...)` on line 5):

```tsx
const Waitlist = lazy(() => import('./pages/Waitlist.js'));
```

Add the route alongside `/welcome` (after `<Route path="/welcome" element={<Landing />} />` on line 38):

```tsx
<Route path="/waitlist" element={<Waitlist />} />
```

- [ ] **Step 4: Type-check**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify against the running backend**

With the backend running (`npm --prefix server run dev`, port 3004) and the client dev server running (`npm --prefix client run dev`, port 5173, proxying `/api` → the backend per `client/vite.config.ts`), navigate to `http://localhost:5173/waitlist` and exercise all states:
1. Submit a new name/email → confirm "You're on the list — we'll be in touch." renders.
2. Submit the exact same email again → confirm "You're already on the list!" renders.
3. Submit an invalid email (e.g. `not-an-email`) → confirm the inline validation message renders and no network request is made (check the browser's network tab).
4. Stop the backend server, submit a fresh valid name/email → confirm the inline error message renders (from the caught `fetch` failure) and the form re-enables for retry. Restart the backend afterward.
5. Click the header logo/wordmark → confirm it navigates to `/welcome`.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/api.ts client/src/pages/Waitlist.tsx client/src/App.tsx
git commit -m "feat(client): add waitlist page wired to the backend endpoint"
```
