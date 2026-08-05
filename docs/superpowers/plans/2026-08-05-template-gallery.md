# Industry Template Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Template Gallery page where users browse premade template ideas by industry and, on selection, land in the existing template designer with the "Ask AI" chat already open and seeded with an industry-specific prompt.

**Architecture:** A static client-side content registry (no backend/DB changes) feeds a new gallery page. Selecting a template navigates to the existing blank-designer route with the seed prompt passed via router state; the designer reads that state once on mount to auto-open and auto-seed the existing AI chat panel.

**Tech Stack:** React + TypeScript + React Router (existing client stack). No new dependencies.

## Global Constraints

- No backend or database changes — the gallery's content lives entirely in a static TypeScript file on the client.
- No change to existing "New Template" entry points (Dashboard, Templates page, Sidebar's "New Template" item) — they keep navigating straight to a blank `/templates/new`, unchanged.
- Selecting a gallery template does not create a DB row — behaves exactly like today's `id`-less designer flow; nothing is saved until the user explicitly saves/publishes.
- `AskAiPanel`'s behavior for manually-opened chats (every existing call site) must be unchanged — the auto-send behavior only activates when an `initialPrompt` prop is explicitly passed.
- The seed prompt is auto-sent exactly once, only when `TemplateDesigner` mounts fresh (`id` is `undefined`) with a seed prompt present in router state.

This codebase has no test runner configured for the client (`client/package.json` has no test script, no vitest/jest/testing-library). Verification in this plan follows the pattern already established throughout this project: `npx tsc --noEmit -p .` for type safety, TypeScript tuple types where they can catch real mistakes at compile time (e.g. "exactly 5 templates"), and manual verification in the browser preview for behavior. Do not introduce a new test framework as part of this plan.

---

### Task 1: Gallery content registry

**Files:**
- Create: `client/src/lib/templateGallery.ts`

**Interfaces:**
- Produces: `TEMPLATE_GALLERY: readonly [GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry]` (a 6-tuple — the type itself enforces exactly 6 industries at compile time)
- Produces: `interface GalleryIndustry { id: string; name: string; icon: LucideIcon; templates: readonly [GalleryTemplate, GalleryTemplate, GalleryTemplate, GalleryTemplate, GalleryTemplate] }` (5-tuple — enforces exactly 5 templates per industry at compile time)
- Produces: `interface GalleryTemplate { id: string; name: string; description: string; seedPrompt: string }`

- [ ] **Step 1: Write the content file**

Create `client/src/lib/templateGallery.ts`:

```ts
import type { LucideIcon } from 'lucide-react';
import { Users, HardHat, Building2, ShoppingBag, HeartPulse, GraduationCap } from 'lucide-react';

export interface GalleryTemplate {
  id: string;
  name: string;
  description: string;
  seedPrompt: string;
}

export interface GalleryIndustry {
  id: string;
  name: string;
  icon: LucideIcon;
  templates: readonly [GalleryTemplate, GalleryTemplate, GalleryTemplate, GalleryTemplate, GalleryTemplate];
}

export const TEMPLATE_GALLERY: readonly [
  GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry, GalleryIndustry
] = [
  {
    id: 'hr',
    name: 'HR & Onboarding',
    icon: Users,
    templates: [
      {
        id: 'hr-offer-letter',
        name: 'Offer Letter',
        description: 'A formal job offer with role, compensation, and sign-off.',
        seedPrompt: 'Create a job offer letter template with fields for candidate name, job title, department, start date, annual salary, reporting manager, offer expiry date, and signature lines for the candidate and the hiring manager.',
      },
      {
        id: 'hr-onboarding-checklist',
        name: 'Employee Onboarding Checklist',
        description: 'Track equipment, accounts, and orientation for new hires.',
        seedPrompt: 'Create an employee onboarding checklist with fields for employee name, start date, department, a checklist of onboarding tasks (equipment issued, accounts created, orientation completed, handbook received), and sign-off lines for the new hire and their manager.',
      },
      {
        id: 'hr-leave-request',
        name: 'Leave Request Form',
        description: 'Employee time-off requests with manager approval.',
        seedPrompt: 'Create a leave request form with fields for employee name, employee ID, leave type (annual, sick, unpaid), start date, end date, total days requested, reason for leave, and signature lines for the employee and approving manager.',
      },
      {
        id: 'hr-timesheet',
        name: 'Timesheet',
        description: 'Weekly hours worked, signed off by employee and supervisor.',
        seedPrompt: 'Create a weekly timesheet with fields for employee name, employee ID, week ending date, a table of days worked with hours per day, total hours, and signature lines for the employee and their supervisor.',
      },
      {
        id: 'hr-offboarding',
        name: 'Exit / Offboarding Form',
        description: 'Wrap up equipment return and final pay on an employee exit.',
        seedPrompt: 'Create an employee exit form with fields for employee name, last working day, reason for leaving, equipment returned checklist, final pay confirmation, and signature lines for the employee and HR representative.',
      },
    ],
  },
  {
    id: 'construction',
    name: 'Construction & Facilities',
    icon: HardHat,
    templates: [
      {
        id: 'construction-visitor-log',
        name: 'Site Visitor Log',
        description: 'Track who is on site and why, with a safety acknowledgment.',
        seedPrompt: 'Create a construction site visitor log with fields for visitor name, company, date, time in, time out, purpose of visit, host name, and a safety briefing acknowledgment signature.',
      },
      {
        id: 'construction-safety-inspection',
        name: 'Safety Inspection Checklist',
        description: 'Routine site safety checks with an inspector sign-off.',
        seedPrompt: 'Create a site safety inspection checklist with fields for site name, inspector name, inspection date, a checklist of safety items (PPE worn, hazards flagged, equipment guarded, walkways clear), notes, and inspector signature.',
      },
      {
        id: 'construction-equipment-checkout',
        name: 'Equipment Checkout Form',
        description: 'Log tools and equipment leaving and returning to site.',
        seedPrompt: 'Create an equipment checkout form with fields for equipment name, equipment ID, checked out by, date checked out, expected return date, condition notes, and signature lines for checkout and return.',
      },
      {
        id: 'construction-work-order',
        name: 'Work Order',
        description: 'Assign and track a piece of requested work.',
        seedPrompt: 'Create a work order form with fields for work order number, requested by, date, location, description of work, priority level, assigned technician, and completion sign-off.',
      },
      {
        id: 'construction-incident-report',
        name: 'Incident Report',
        description: 'Document what happened, injuries, and corrective action.',
        seedPrompt: 'Create a site incident report with fields for date and time of incident, location, people involved, description of what happened, injuries (if any), corrective actions taken, and signature lines for the reporter and site supervisor.',
      },
    ],
  },
  {
    id: 'real-estate',
    name: 'Real Estate',
    icon: Building2,
    templates: [
      {
        id: 'real-estate-lease',
        name: 'Lease Agreement',
        description: 'Core residential lease terms for landlord and tenant.',
        seedPrompt: 'Create a residential lease agreement template with fields for landlord name, tenant name, property address, lease start date, lease end date, monthly rent, security deposit amount, and signature lines for landlord and tenant.',
      },
      {
        id: 'real-estate-property-inspection',
        name: 'Property Inspection Checklist',
        description: 'Room-by-room condition record at inspection time.',
        seedPrompt: 'Create a property inspection checklist with fields for property address, inspection date, inspector name, a room-by-room condition checklist (walls, floors, fixtures, appliances), notes, and signature lines for inspector and tenant.',
      },
      {
        id: 'real-estate-tenant-application',
        name: 'Tenant Application',
        description: 'Prospective tenant details, income, and references.',
        seedPrompt: 'Create a rental tenant application form with fields for applicant name, contact details, current address, employer name, monthly income, references, desired move-in date, and applicant signature.',
      },
      {
        id: 'real-estate-move-checklist',
        name: 'Move-In/Move-Out Checklist',
        description: 'Condition record and damage notes at move in or out.',
        seedPrompt: 'Create a move-in/move-out condition checklist with fields for property address, tenant name, move date, a condition checklist per room, damage notes, and signature lines for landlord and tenant.',
      },
      {
        id: 'real-estate-maintenance-request',
        name: 'Maintenance Request',
        description: 'Tenant-submitted repair or maintenance issue.',
        seedPrompt: 'Create a property maintenance request form with fields for tenant name, unit/property address, date submitted, description of the issue, urgency level, preferred access times, and tenant signature.',
      },
    ],
  },
  {
    id: 'retail-hospitality',
    name: 'Retail & Hospitality',
    icon: ShoppingBag,
    templates: [
      {
        id: 'retail-purchase-order',
        name: 'Purchase Order',
        description: 'Itemized order to a supplier with delivery details.',
        seedPrompt: 'Create a purchase order form with fields for PO number, vendor name, order date, a table of items ordered with quantity and unit price, total amount, delivery address, and authorizing signature.',
      },
      {
        id: 'retail-delivery-note',
        name: 'Delivery Note',
        description: 'Confirm items and condition on delivery.',
        seedPrompt: 'Create a delivery note with fields for delivery date, supplier name, recipient name, a table of items delivered with quantities, condition on arrival, and signature lines for delivery driver and recipient.',
      },
      {
        id: 'retail-customer-registration',
        name: 'Customer Registration Form',
        description: 'Capture new customer contact details and consent.',
        seedPrompt: 'Create a customer registration form with fields for full name, contact number, email address, mailing address, date of registration, marketing consent checkbox, and customer signature.',
      },
      {
        id: 'retail-incident-report',
        name: 'Incident Report',
        description: 'Document a customer-facing incident and the response.',
        seedPrompt: 'Create a customer-facing incident report with fields for date and time, location, description of the incident, people involved, witnesses, action taken, and signature lines for the reporting staff member and manager.',
      },
      {
        id: 'retail-guest-feedback',
        name: 'Guest Feedback Form',
        description: 'Ratings and comments from a guest or customer visit.',
        seedPrompt: "Create a guest feedback form with fields for guest name, visit date, service rating, food/product quality rating, comments, whether they'd recommend the business, and an optional contact field for follow-up.",
      },
    ],
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    icon: HeartPulse,
    templates: [
      {
        id: 'healthcare-patient-intake',
        name: 'Patient Intake Form',
        description: 'New patient details, history, and emergency contact.',
        seedPrompt: 'Create a patient intake form with fields for patient name, date of birth, contact details, emergency contact, reason for visit, known allergies, current medications, and patient signature.',
      },
      {
        id: 'healthcare-consent-to-treatment',
        name: 'Consent to Treatment',
        description: 'Documented consent before a procedure or treatment.',
        seedPrompt: 'Create a consent to treatment form with fields for patient name, date of birth, description of proposed treatment, risks explained checkbox, physician name, and signature lines for patient and physician.',
      },
      {
        id: 'healthcare-appointment-record',
        name: 'Appointment Record',
        description: 'Visit summary and follow-up scheduling.',
        seedPrompt: 'Create an appointment record form with fields for patient name, date and time of appointment, provider name, reason for visit, notes, follow-up required checkbox, and next appointment date.',
      },
      {
        id: 'healthcare-discharge-summary',
        name: 'Discharge Summary',
        description: 'Diagnosis, treatment, and discharge instructions.',
        seedPrompt: 'Create a patient discharge summary with fields for patient name, admission date, discharge date, diagnosis, treatment summary, discharge instructions, follow-up care needed, and physician signature.',
      },
      {
        id: 'healthcare-visitor-log',
        name: 'Visitor Log',
        description: 'Track hospital visitors with a health screening step.',
        seedPrompt: 'Create a hospital visitor log with fields for visitor name, patient visited, relationship to patient, date, time in, time out, and a health screening confirmation checkbox.',
      },
    ],
  },
  {
    id: 'education',
    name: 'Education',
    icon: GraduationCap,
    templates: [
      {
        id: 'education-enrollment',
        name: 'Student Enrollment Form',
        description: 'New student and guardian details for enrollment.',
        seedPrompt: 'Create a student enrollment form with fields for student full name, date of birth, grade applying for, parent/guardian name, contact details, home address, and parent/guardian signature.',
      },
      {
        id: 'education-parental-consent',
        name: 'Parental Consent Form',
        description: 'Guardian consent for a specific school activity.',
        seedPrompt: 'Create a parental consent form with fields for student name, grade, description of the activity requiring consent, date, parent/guardian name, and parent/guardian signature.',
      },
      {
        id: 'education-field-trip-permission',
        name: 'Field Trip Permission Slip',
        description: 'Trip details, emergency contact, and guardian sign-off.',
        seedPrompt: 'Create a field trip permission slip with fields for student name, grade, trip destination, trip date, departure and return times, emergency contact, medical notes, and parent/guardian signature.',
      },
      {
        id: 'education-incident-report',
        name: 'Incident Report',
        description: 'Document a school incident and guardian notification.',
        seedPrompt: 'Create a school incident report with fields for student name, date and time, location, description of the incident, witnesses, action taken, and signature lines for the staff member and parent/guardian notified.',
      },
      {
        id: 'education-attendance-record',
        name: 'Attendance Record',
        description: 'Daily class attendance signed off by the teacher.',
        seedPrompt: 'Create a class attendance record with fields for class name, teacher name, date, a table of student names with present/absent/late marks, and teacher signature.',
      },
    ],
  },
];
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors. If you accidentally wrote 4 or 6 templates for an industry (instead of exactly 5), or 5 or 7 industries (instead of exactly 6), this step fails with a tuple-length type error — that's the check working as intended.

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/templateGallery.ts
git commit -m "feat(gallery): add industry template content registry"
```

---

### Task 2: Gallery page, route, and nav entry

**Files:**
- Create: `client/src/pages/TemplateGallery.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `TEMPLATE_GALLERY` from `../lib/templateGallery.js` (Task 1)
- Produces: `TemplateGallery` default-exported page component, mounted at route `/templates/gallery`

- [ ] **Step 1: Write the gallery page**

Create `client/src/pages/TemplateGallery.tsx`:

```tsx
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
```

- [ ] **Step 2: Wire the route**

Modify `client/src/App.tsx`. Add the lazy import after the `TemplateList` import (line 7):

```tsx
const TemplateGallery = lazy(() => import('./pages/TemplateGallery.js'));
```

Add the route after the `/templates` route (after line 38, before the `/templates/new` route):

```tsx
        <Route
          path="/templates/gallery"
          element={
            <RoleGuard allowed={['Admin', 'Designer']}>
              <TemplateGallery />
            </RoleGuard>
          }
        />
```

- [ ] **Step 3: Add the nav entry**

Modify `client/src/components/layout/Sidebar.tsx`. Add `LayoutGrid` to the existing lucide-react import (line 2-10):

```tsx
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Settings,
  LogOut,
  Image,
  BookOpen,
  LayoutGrid,
} from 'lucide-react';
```

Add a new `NavItem` directly after the existing "New Template" item (after line 91):

```tsx
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/templates/gallery" icon={<LayoutGrid className="h-4 w-4" />} label="Template Gallery" />
        )}
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Start the client dev server via the Browser pane's `preview_start` (name: `client`), sign in as Admin or Designer (use the role switcher at the bottom of the sidebar), then:

1. Navigate to `/templates/gallery` directly, or click the new "Template Gallery" sidebar item.
2. Confirm all 6 industry pills render (HR & Onboarding, Construction & Facilities, Real Estate, Retail & Hospitality, Healthcare, Education), with the first one active by default.
3. Click through at least 3 different pills and confirm each shows exactly 5 cards with the right icon, name, and description.
4. Click "Use this template" on any card — confirm the URL changes to `/templates/new` and the blank designer loads without error. (The Ask AI panel will not yet auto-open — that's expected until Task 3 lands.)
5. Click "Or start from a blank template" — confirm it navigates straight to `/templates/new`.
6. Switch the role switcher to "Filler" and confirm the "Template Gallery" sidebar item disappears (same gating as "New Template").

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TemplateGallery.tsx client/src/App.tsx client/src/components/layout/Sidebar.tsx
git commit -m "feat(gallery): add template gallery page, route, and nav entry"
```

---

### Task 3: Auto-seed the AI chat from the gallery selection

**Files:**
- Modify: `client/src/components/AskAiPanel.tsx`
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: router state `{ seedPrompt?: string }` set by Task 2's `navigate('/templates/new', { state: { seedPrompt } })`
- Produces: `AskAiPanel` gains an optional `initialPrompt?: string` prop that auto-sends once on mount when present

- [ ] **Step 1: Add `initialPrompt` support to `AskAiPanel`**

Modify `client/src/components/AskAiPanel.tsx`. Change the imports at the top (line 1) to add `useEffect`:

```tsx
import { useEffect, useRef, useState } from 'react';
```

Change the props interface (lines 6-10) to add `initialPrompt`:

```tsx
interface AskAiPanelProps {
  onClose: () => void;
  onTemplateReady: (template: Template) => void;
  occupiedRegions?: AiOccupiedRegion[];
  initialPrompt?: string;
}
```

Change the component signature (line 12) to destructure the new prop:

```tsx
export default function AskAiPanel({ onClose, onTemplateReady, occupiedRegions, initialPrompt }: AskAiPanelProps) {
```

Add a new ref alongside the existing `listEndRef` (after line 18):

```tsx
  const initialPromptSentRef = useRef(false);
```

Replace the `send` function (lines 20-38) so it accepts an optional override string instead of always reading from `input` state — this lets the auto-send effect pass the seed prompt directly without a stale-closure bug, while every existing manual call site (`send()`, no argument) keeps working exactly as before:

```tsx
  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    const next: AiChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError(null);
    try {
      const res = await api.aiFormChat(next, occupiedRegions);
      setMessages([...next, { role: 'assistant', content: res.message }]);
      if (res.done && res.template) {
        onTemplateReady(res.template);
      }
      setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
```

Add a new effect directly after the `send` function definition, before `handleKeyDown`:

```tsx
  useEffect(() => {
    if (!initialPrompt || initialPromptSentRef.current) return;
    initialPromptSentRef.current = true;
    void send(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Do not change anything else in this file — the Send button (`onClick={() => void send()}`) and the textarea's `handleKeyDown` (`void send()`) already call `send()` with no argument, which still reads from `input` state exactly as before.

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Wire the seed prompt through `TemplateDesigner`**

Modify `client/src/pages/TemplateDesigner.tsx`. Change the react-router import (line 2) to add `useLocation`:

```tsx
import { useNavigate, useParams, useLocation } from 'react-router-dom';
```

Add these two lines directly after `const navigate = useNavigate();` (after line 261):

```tsx
  const location = useLocation();
  const seedPrompt = (location.state as { seedPrompt?: string } | null)?.seedPrompt;
```

In the mount effect's `init` function, add one line right after `setTemplateVersion(v => v + 1);` (after line 311, still inside `init`, before its closing `};` on line 312):

```tsx
      if (!id && seedPrompt) setAiOpen(true);
```

The full `init` function body should now read:

```tsx
    const init = async () => {
      if (!containerRef.current) return;
      let template: Template = BLANK_TEMPLATE;
      if (id) {
        const record = await api.getTemplate(id);
        template = (record.draft?.schema ?? record.latestPublished?.schema ?? BLANK_TEMPLATE) as Template;
        if (mounted) setName(record.name);
      }
      if (!mounted || !containerRef.current) return;
      designerRef.current = new Designer({
        domContainer: containerRef.current,
        template,
        options: { font: getFonts(), lang: 'en' },
        plugins: getPlugins(),
      });
      setTemplateVersion(v => v + 1);
      if (!id && seedPrompt) setAiOpen(true);
    };
```

Finally, pass the prompt to `AskAiPanel` (lines 913-917) — add `initialPrompt={seedPrompt}`:

```tsx
      {aiOpen && (
        <AskAiPanel
          onClose={() => setAiOpen(false)}
          onTemplateReady={handleAiTemplateReady}
          occupiedRegions={getAiOccupiedRegions()}
          initialPrompt={seedPrompt}
        />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Verify end-to-end in the browser**

Using the Browser pane against the running client dev server (and the server dev process, since this hits the real `/api/ai-form/chat` endpoint which needs `OPENAI_API_KEY` — already set in `server/.env`):

1. As Admin or Designer, go to "Template Gallery" in the sidebar, pick any industry, and click "Use this template" on a card.
2. Confirm you land on the designer and the "Ask AI" panel is already open, showing the seed prompt as the first user message (after the initial assistant greeting), with the assistant already responding or having responded.
3. If the assistant asks a follow-up question instead of finishing, answer it manually in the chat and confirm the conversation continues normally — this is the existing multi-turn behavior, unchanged.
4. Once the assistant finishes (`done: true`), confirm fields appear on the canvas and the panel's content matches what you'd expect for that template (e.g. the Offer Letter template produces fields resembling candidate name, job title, salary, etc.).
5. Regression check — open the toolbar's own "Ask AI" button on a *fresh* `/templates/new` (navigated to directly, not via the gallery): confirm the chat opens with only the initial assistant greeting and nothing pre-sent, exactly as before this change.
6. Regression check — navigate to `/templates/new` directly (not via the gallery, no router state): confirm the designer loads with the Ask AI panel closed, exactly as before this change.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AskAiPanel.tsx client/src/pages/TemplateDesigner.tsx
git commit -m "feat(gallery): auto-seed Ask AI chat from gallery selection"
```
