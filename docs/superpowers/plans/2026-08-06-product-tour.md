# Guided Product Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, opt-in guided product tour — a "Take a tour" button (in the shared `TopBar`) that walks the user through the Sidebar's role-aware nav items, the role switcher, and the Dashboard's stats/recent-templates sections using `driver.js` tooltip bubbles.

**Architecture:** A new content module (`client/src/lib/productTour.ts`) owns the step list and role-gating logic, mirrored directly from `Sidebar.tsx`'s existing role checks. `TopBar` gains a self-contained button that navigates to `/` with router state; `Dashboard` consumes that state once (same proven pattern as the Template Gallery's `seedPrompt` handoff) and calls into the tour module. `Sidebar` and `Dashboard` gain `data-tour="..."` attributes as the tour's anchor points.

**Tech Stack:** React + TypeScript + React Router (existing client stack) + `driver.js` (new dependency, v1.8.0).

## Global Constraints

- The tour never auto-shows — manual trigger only, no persisted "has seen tour" state.
- The tour's role-gating (`canManage`, `isAdmin`) must be a direct mirror of `Sidebar.tsx`'s existing `(role === 'Admin' || role === 'Designer')` / `role === 'Admin'` checks — not independently derived logic that could drift.
- No changes to any of the 6 pages that render `<TopBar>` other than `Dashboard.tsx` itself (which needs the state-consumption wiring) — the "Take a tour" button lives inside `TopBar`, so it appears everywhere for free.
- Popover styling overrides `driver.js`'s default look to match the existing `--nx-*` design tokens, using `driver.js`'s real, documented CSS class names (`driver-popover`, `driver-popover-title`, `driver-popover-description`, `driver-popover-footer-btn`, `driver-popover-next-btn`, `driver-popover-close-btn`, `driver-popover-progress-text`) — not guessed selectors.
- This codebase has no test runner configured for the client. Verification is `npx tsc --noEmit -p .` plus manual browser verification, matching the pattern used throughout this codebase's recent history.

---

### Task 1: Install driver.js and add the tour content module

**Files:**
- Modify: `client/package.json` (new dependency)
- Create: `client/src/lib/productTour.ts`

**Interfaces:**
- Produces: `startProductTour(role: Role): void`, exported from `client/src/lib/productTour.ts`. Imports `Role` from `../types.js`.

- [ ] **Step 1: Install driver.js**

```bash
cd client && npm install driver.js
```

Expected: `client/package.json` gains `"driver.js": "^1.8.0"` (or whatever the installed patch version resolves to) under `dependencies`. `client/package-lock.json` updates accordingly.

- [ ] **Step 2: Write the tour content module**

Create `client/src/lib/productTour.ts`:

```ts
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { Role } from '../types.js';

export function startProductTour(role: Role) {
  const canManage = role === 'Admin' || role === 'Designer';
  const isAdmin = role === 'Admin';

  driver({
    showProgress: true,
    smoothScroll: true,
    popoverClass: 'nx-tour-popover',
    steps: [
      {
        element: '[data-tour="sidebar-dashboard"]',
        popover: {
          title: 'Dashboard',
          description: 'Your home base — template stats and a shortcut back into recent work.',
        },
      },
      {
        element: '[data-tour="sidebar-templates"]',
        popover: {
          title: 'Templates',
          description: 'Every template your team has created. Fill or edit them from here.',
        },
      },
      ...(canManage
        ? [
            {
              element: '[data-tour="sidebar-new-template"]',
              popover: {
                title: 'New Template',
                description: 'Start from a blank canvas, or describe what you need and let AI build it with you.',
              },
            },
          ]
        : []),
      ...(canManage
        ? [
            {
              element: '[data-tour="sidebar-gallery"]',
              popover: {
                title: 'Template Gallery',
                description: 'Pick a premade starting point for your industry — HR, construction, real estate, and more.',
              },
            },
          ]
        : []),
      ...(canManage
        ? [
            {
              element: '[data-tour="sidebar-assets"]',
              popover: {
                title: 'Assets',
                description: 'Upload logos, stamps, and images to reuse across your templates.',
              },
            },
          ]
        : []),
      ...(canManage
        ? [
            {
              element: '[data-tour="sidebar-letterheads"]',
              popover: {
                title: 'Letterheads',
                description: 'Build a reusable header and footer once, then apply it to any template.',
              },
            },
          ]
        : []),
      ...(isAdmin
        ? [
            {
              element: '[data-tour="sidebar-settings"]',
              popover: {
                title: 'Settings',
                description: 'Manage your workspace settings from here.',
              },
            },
          ]
        : []),
      {
        element: '[data-tour="sidebar-role-switcher"]',
        popover: {
          title: 'Switch roles',
          description: 'Preview the app as an Admin, Designer, or Form Filler — each sees a different set of tools.',
        },
      },
      {
        element: '[data-tour="dashboard-stats"]',
        popover: {
          title: 'At a glance',
          description: 'Total templates, recent activity, and when things were last updated.',
        },
      },
      {
        element: '[data-tour="dashboard-recent"]',
        popover: {
          title: 'Recent Templates',
          description: 'Jump straight back into whatever you were working on.',
        },
      },
      {
        popover: {
          title: "You're all set!",
          description: 'Explore at your own pace — click "Take a tour" anytime from the top bar for a refresher.',
        },
      },
    ],
  }).drive();
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors. `driver.js` ships its own TypeScript types, so no `@types/driver.js` package is needed — if `tsc` reports missing types, the install in Step 1 did not complete correctly; re-run it rather than adding a types package.

- [ ] **Step 4: Commit**

```bash
git add client/package.json client/package-lock.json client/src/lib/productTour.ts
git commit -m "feat(tour): add driver.js and product tour content module"
```

---

### Task 2: Sidebar tour anchors and TopBar "Take a tour" button

**Files:**
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/layout/TopBar.tsx`

**Interfaces:**
- Produces: `data-tour="sidebar-dashboard"`, `data-tour="sidebar-templates"`, `data-tour="sidebar-new-template"`, `data-tour="sidebar-gallery"`, `data-tour="sidebar-assets"`, `data-tour="sidebar-letterheads"`, `data-tour="sidebar-settings"`, `data-tour="sidebar-role-switcher"` — DOM attributes on the corresponding Sidebar elements, matching exactly the selectors `productTour.ts` (Task 1) already references.
- Produces: a "Take a tour" button in `TopBar`, self-contained (owns its own `useNavigate` call), that calls `navigate('/', { state: { startTour: true } })` on click.

- [ ] **Step 1: Add `tourId` to `NavItem` and wire it through each nav entry**

Modify `client/src/components/layout/Sidebar.tsx`. Change the `NavItemProps` interface (currently lines 17-22):

```tsx
interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  tourId?: string;
}
```

Change the `NavItem` function (currently lines 24-49) to destructure and apply `tourId`:

```tsx
function NavItem({ to, icon, label, end, tourId }: NavItemProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <NavLink
            to={to}
            end={end}
            data-tour={tourId}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors duration-150 rounded-[var(--nx-radius-sm)]',
                isActive
                  ? 'bg-[var(--nx-accent-tint)] text-[var(--nx-accent)]'
                  : 'text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)] hover:text-[var(--nx-ink)]'
              )
            }
          >
            <span className="shrink-0">{icon}</span>
            <span>{label}</span>
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

Change the nav item call sites (currently lines 88-104) to add `tourId` to each:

```tsx
        <NavItem to="/" end icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" tourId="sidebar-dashboard" />
        <NavItem to="/templates" icon={<FileText className="h-4 w-4" />} label="Templates" tourId="sidebar-templates" />
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/templates/new" icon={<PlusCircle className="h-4 w-4" />} label="New Template" tourId="sidebar-new-template" />
        )}
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/templates/gallery" icon={<LayoutGrid className="h-4 w-4" />} label="Template Gallery" tourId="sidebar-gallery" />
        )}
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/assets" icon={<Image className="h-4 w-4" />} label="Assets" tourId="sidebar-assets" />
        )}
        {(role === 'Admin' || role === 'Designer') && (
          <NavItem to="/letterheads" icon={<BookOpen className="h-4 w-4" />} label="Letterheads" tourId="sidebar-letterheads" />
        )}
        {role === 'Admin' && (
          <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" tourId="sidebar-settings" />
        )}
```

- [ ] **Step 2: Add the role-switcher anchor**

In the same file, add `data-tour="sidebar-role-switcher"` to the role-switcher wrapping `<div>` (currently line 110, the `<div>` directly containing the "Switch Role" label and the Admin/Designer/Filler buttons):

```tsx
        <div data-tour="sidebar-role-switcher">
```

- [ ] **Step 3: Add the "Take a tour" button to TopBar**

Modify `client/src/components/layout/TopBar.tsx`. Replace the full file with:

```tsx
import { Bell, Search, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../ui/input.js';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

interface TopBarProps {
  title: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
}

export function TopBar({ title, ctaLabel, onCtaClick, className }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header
      className={cn('sticky top-0 z-30 flex h-16 items-center gap-4 px-6 bg-white', className)}
      style={{ borderBottom: '1px solid var(--nx-hairline)' }}
    >
      {/* Title */}
      <h1 className="text-base font-semibold flex-1 tracking-tight" style={{ color: 'var(--nx-ink)' }}>
        {title}
      </h1>

      {/* Search */}
      <div className="relative hidden sm:block w-56">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          style={{ color: 'var(--nx-ink-muted)' }}
        />
        <Input
          type="search"
          placeholder="Search…"
          className="pl-8 h-8 text-xs rounded-[var(--nx-radius-sm)]"
          style={{ background: 'var(--nx-surface)', borderColor: 'var(--nx-hairline)', color: 'var(--nx-ink)' }}
        />
      </div>

      {/* Take a tour */}
      <button
        onClick={() => navigate('/', { state: { startTour: true } })}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)] transition-colors duration-150"
        style={{ color: 'var(--nx-ink-muted)', border: '1px solid var(--nx-hairline)' }}
        title="Take a tour"
      >
        <HelpCircle className="h-4 w-4" />
        <span className="sr-only">Take a tour</span>
      </button>

      {/* Bell */}
      <button
        className="relative flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)] transition-colors duration-150"
        style={{ color: 'var(--nx-ink-muted)', border: '1px solid var(--nx-hairline)' }}
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--nx-accent)' }} />
        <span className="sr-only">Notifications</span>
      </button>

      {/* CTA */}
      {ctaLabel && onCtaClick && (
        <Button onClick={onCtaClick} size="sm">
          {ctaLabel}
        </Button>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Start the client dev server (see this codebase's established pattern: run `npx vite` directly from `client/` if using a worktree, since `preview_start`'s `name` resolution has previously been observed to resolve the wrong repo's `launch.json` from inside a worktree — check `lsof` for the target port first if unsure).

1. On any `AppLayout` page (e.g. Dashboard), confirm the new "Take a tour" icon button renders in the top bar, between the search box and the notification bell.
2. Open browser devtools and inspect the Sidebar DOM: confirm each nav item and the role-switcher `<div>` carries the correct `data-tour` attribute (e.g. `document.querySelector('[data-tour="sidebar-dashboard"]')` returns the Dashboard `NavLink`).
3. Click "Take a tour" from a non-Dashboard page (e.g. Assets): confirm it navigates to `/`. No visible tour will start yet — that's expected, since `Dashboard.tsx` doesn't consume the router state until Task 3. This step is only verifying navigation and the DOM attributes, not the full tour experience.
4. Switch role to "Filler" (bottom-left role switcher) and confirm the Sidebar nav items that should be hidden for that role (New Template, Template Gallery, Assets, Letterheads, Settings) are indeed absent, and the ones that remain (Dashboard, Templates) still carry their `data-tour` attributes.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/layout/Sidebar.tsx client/src/components/layout/TopBar.tsx
git commit -m "feat(tour): add tour anchors to Sidebar and a Take a tour button to TopBar"
```

---

### Task 3: Wire the tour into Dashboard and theme the popover

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: `startProductTour(role: Role)` from `client/src/lib/productTour.js` (Task 1); the `data-tour="sidebar-*"` attributes and "Take a tour" button from Task 2.
- Produces: end-to-end working tour, launchable from any `AppLayout` page.

- [ ] **Step 1: Consume the `startTour` router state and add Dashboard's own tour anchors**

Modify `client/src/pages/Dashboard.tsx`. Change the react-router import (currently line 2):

```tsx
import { useNavigate, useLocation } from 'react-router-dom';
```

Add the `startProductTour` import after the existing `cn` import (currently line 11):

```tsx
import { startProductTour } from '../lib/productTour.js';
```

Add `useLocation` and a captured-once `startTour` flag right after `const navigate = useNavigate();` (currently line 49):

```tsx
  const location = useLocation();
  const [startTour, setStartTour] = useState(
    () => Boolean((location.state as { startTour?: boolean } | null)?.startTour)
  );
```

Add a new effect after the existing data-fetch effect (currently lines 53-58, the one calling `api.listTemplates()`):

```tsx
  useEffect(() => {
    if (!startTour) return;
    if (location.state) navigate(location.pathname + location.search + location.hash, { replace: true, state: null });
    startProductTour(role);
    setStartTour(false);
  }, [startTour, role, location.state, location.pathname, location.search, location.hash, navigate]);
```

Add `data-tour="dashboard-stats"` to the stats `<Card>` (currently line 83):

```tsx
        <Card className="overflow-hidden" data-tour="dashboard-stats">
```

Add `data-tour="dashboard-recent"` to the "Recent templates" wrapping `<div>` (currently line 93, the `<div>` immediately following the closing `</Card>` of the stats strip):

```tsx
        <div data-tour="dashboard-recent">
```

- [ ] **Step 2: Add the popover theme to index.css**

Modify `client/src/index.css`. Append this block at the end of the file:

```css
/* ── Product tour popover (driver.js) ── */
.driver-popover.nx-tour-popover {
  background: #ffffff;
  color: var(--nx-ink);
  border-radius: var(--nx-radius-md);
  border: 1px solid var(--nx-hairline);
  box-shadow: 0 24px 64px rgba(10, 37, 64, 0.18);
  font-family: 'Figtree', system-ui, -apple-system, sans-serif;
  padding: 16px;
}
.driver-popover.nx-tour-popover .driver-popover-title {
  color: var(--nx-ink);
  font-size: 14px;
  font-weight: 700;
}
.driver-popover.nx-tour-popover .driver-popover-description {
  color: var(--nx-ink-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.driver-popover.nx-tour-popover .driver-popover-progress-text {
  color: var(--nx-ink-muted);
  font-size: 11px;
}
.driver-popover.nx-tour-popover .driver-popover-footer-btn {
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border: 1px solid var(--nx-hairline);
  background: transparent;
  color: var(--nx-ink-secondary);
  text-shadow: none;
}
.driver-popover.nx-tour-popover .driver-popover-next-btn {
  background: var(--nx-accent);
  border-color: var(--nx-accent);
  color: #ffffff;
}
.driver-popover.nx-tour-popover .driver-popover-close-btn {
  color: var(--nx-ink-muted);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Verify end-to-end in the browser**

1. As Admin, click "Take a tour" from the Dashboard itself: confirm the tour starts immediately, showing 10 steps in order (Dashboard, Templates, New Template, Template Gallery, Assets, Letterheads, Settings, Switch roles, At a glance, Recent Templates) plus a closing step with no highlighted element, each with the overlay dimming the rest of the page and a spotlight cutout around the current target. Confirm the popover matches the app's look (white background, `--nx-ink` text, emerald "Next" button, pill-shaped buttons) rather than driver.js's default black/white theme.
2. Click "Next" through to the end, then click "Done" on the last step: confirm the tour closes cleanly with no console errors.
3. Click "Take a tour" again from a non-Dashboard page (e.g. Templates): confirm it navigates to Dashboard and the tour starts there automatically, without needing a second click.
4. Switch role to "Filler", click "Take a tour": confirm only 4 steps appear (Dashboard, Templates, Switch roles, At a glance, Recent Templates — no New Template/Gallery/Assets/Letterheads/Settings steps), matching that role's actual Sidebar.
5. Regression check — reload the Dashboard directly (no "Take a tour" click): confirm the tour does not auto-start.
6. Regression check — start the tour, close it partway through (via the X button or clicking the overlay), then reload the page: confirm the tour does not restart on reload (this is the same router-state-replay class of bug already fixed once for the Template Gallery feature — confirm it doesn't recur here).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Dashboard.tsx client/src/index.css
git commit -m "feat(tour): wire tour into Dashboard and theme the popover"
```
