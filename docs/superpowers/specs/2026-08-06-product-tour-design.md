# Guided Product Tour

## Problem

New users have no in-app way to learn what the product offers. The only paths to discovery today are the Sidebar's own labels and exploring blind. There's no guided walkthrough explaining what each navigational area does.

## Goal

Add a manual, opt-in guided tour: a "Take a tour" entry point that walks the user through the app's main navigational areas — the Sidebar's nav items (role-aware, matching what's actually visible to their current role), the role switcher, and the Dashboard's stats/recent-templates sections — using positioned tooltip "bubbles" with a dimmed backdrop and a spotlight cutout around the highlighted element.

## Global Constraints

- **Manual trigger only.** The tour never auto-shows. It only starts when the user clicks "Take a tour". No persistence of "has seen tour" state is needed, since there's nothing to remember across visits.
- **`driver.js` (v1.8.0, MIT) is the tour engine** — a new, vetted dependency (confirmed via npm registry: actively maintained, ~150KB unpacked, framework-agnostic, ships its own TypeScript types, zero dependencies of its own). Not to be swapped for a different library or reimplemented from scratch.
- **Role-aware by construction, not duplication.** The tour's step list must be built from the exact same `role === 'Admin' || role === 'Designer'` / `role === 'Admin'` checks already gating the Sidebar's nav items — never a separately-maintained copy of that logic that could drift out of sync with what's actually visible.
- **No changes to any of the 6 pages that render `<TopBar>`** (Dashboard, Templates, Template Gallery, Assets, Letterheads, Submissions) — the "Take a tour" button lives inside `TopBar` itself, self-contained, so it appears everywhere for free with zero call-site changes.
- **Popover styling matches the existing `--nx-*` design tokens** (the same custom properties used throughout the app), not `driver.js`'s default look — same restrained, targeted-CSS-override approach used for every other page in this codebase, not a wholesale re-theme.
- **The tour only ever launches from the Dashboard**, since that's the one page guaranteed to have both the Sidebar (present on every `AppLayout` page) and the Dashboard-specific highlighted sections (stats strip, Recent Templates) in the DOM at once. Clicking "Take a tour" from any other page navigates to Dashboard first.

## Design

### New file: `client/src/lib/productTour.ts`

Owns all tour content and driver.js wiring — the one place that knows what the tour says, so `Dashboard.tsx` and `TopBar.tsx` stay free of a 30-line step list.

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

The spread-conditional pattern for role-gated steps directly mirrors the exact boolean checks in `Sidebar.tsx:90-104` (`(role === 'Admin' || role === 'Designer')` for New Template/Gallery/Assets/Letterheads, `role === 'Admin'` for Settings) — so a future change to who can see a nav item and a future change to who gets that tour step are the same edit, made in the same place, by construction: `Sidebar.tsx` is the single source of truth for which `data-tour` targets exist in the DOM for a given role, and this file's `canManage`/`isAdmin` booleans are copies of that same logic (not re-derived some other way), so both are visibly wrong together if one is ever edited without the other.

### `client/src/components/layout/Sidebar.tsx` — add tour anchors

Add an optional `tourId` prop to `NavItemProps` (currently `{ to, icon, label, end }` at `Sidebar.tsx:17-22`), passed through as a `data-tour` attribute on the `NavLink`:

```tsx
interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  tourId?: string;
}

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

Add `tourId` to each existing `NavItem` call site (`Sidebar.tsx:88-104`), one per line, matching the `data-tour` selectors used in `productTour.ts` above: `tourId="sidebar-dashboard"` on Dashboard, `tourId="sidebar-templates"` on Templates, `tourId="sidebar-new-template"` on New Template, `tourId="sidebar-gallery"` on Template Gallery, `tourId="sidebar-assets"` on Assets, `tourId="sidebar-letterheads"` on Letterheads, `tourId="sidebar-settings"` on Settings.

Add `data-tour="sidebar-role-switcher"` to the role-switcher wrapping `<div>` at `Sidebar.tsx:110` (the one containing the "Switch Role" label and the Admin/Designer/Filler buttons).

### `client/src/components/layout/TopBar.tsx` — self-contained "Take a tour" button

`TopBar` currently takes no navigation-related props and has no `useNavigate` call (`TopBar.tsx:1-13`). Add both internally so no call site needs to change:

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

The `navigate('/', { state: { startTour: true } })` call works identically whether the user is already on Dashboard or elsewhere: React Router treats a `navigate()` call with new `state` as a location change even when the pathname is unchanged, so Dashboard's own state-consuming effect (below) fires either way — no special-casing needed for "am I already on Dashboard?" in `TopBar`.

### `client/src/pages/Dashboard.tsx` — consume `startTour` and add tour anchors

This reuses the exact router-state consumption pattern already proven out (and fixed once in review) for the Template Gallery's `seedPrompt` handoff in `TemplateDesigner.tsx` — same shape, same reasoning, same fix baked in from the start instead of rediscovered:

Add `useLocation` to the react-router import (`Dashboard.tsx:2`):
```tsx
import { useNavigate, useLocation } from 'react-router-dom';
```

Add `startProductTour` import:
```tsx
import { startProductTour } from '../lib/productTour.js';
```

Add `useLocation` and a captured-once `startTour` flag right after the existing `const navigate = useNavigate();` (`Dashboard.tsx:49`):
```tsx
  const location = useLocation();
  const [startTour, setStartTour] = useState(
    () => Boolean((location.state as { startTour?: boolean } | null)?.startTour)
  );
```
(`useState` is already imported at `Dashboard.tsx:1`.)

Add a new effect that starts the tour and clears the router state, placed after the existing data-fetch effect (`Dashboard.tsx:53-58`):
```tsx
  useEffect(() => {
    if (!startTour) return;
    if (location.state) navigate(location.pathname + location.search + location.hash, { replace: true, state: null });
    startProductTour(role);
    setStartTour(false);
  }, [startTour, role, location.state, location.pathname, location.search, location.hash, navigate]);
```
Router state is cleared unconditionally as soon as this effect runs (so a reload can't replay it, matching the gallery fix), and `setStartTour(false)` after calling `startProductTour` prevents a second run driven by any of the effect's other dependencies changing later (e.g. the user switching roles afterward must not silently relaunch the tour).

Add tour anchors to the two Dashboard sections: `data-tour="dashboard-stats"` on the stats `<Card>` at `Dashboard.tsx:83`, and `data-tour="dashboard-recent"` on the "Recent templates" wrapping `<div>` at `Dashboard.tsx:93`.

### `client/src/index.css` — popover theme

Add a block styling `driver.js`'s popover via the `nx-tour-popover` class passed as `popoverClass` above, using `driver.js`'s documented CSS classes (`driver-popover`, `driver-popover-title`, `driver-popover-description`, `driver-popover-footer`, `driver-popover-progress-text`, `driver-popover-close-btn`, `driver-popover-footer-btn`, `driver-popover-next-btn.driver-popover-done-btn` — confirmed from `driver.js`'s own theming docs, not guessed) so the tooltip matches the app's existing `--nx-*` tokens instead of the library default:

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

### `client/package.json` — new dependency

Add `driver.js` (`^1.8.0`) via `npm install driver.js` in `client/`.

## What doesn't change

- No auto-show / no persisted "has seen tour" flag — the manual-only decision means there's nothing to store.
- `Dashboard.tsx`, `TemplateList.tsx`, and every other existing "New Template" entry point — untouched by this feature (this spec is additive to `Dashboard.tsx` only for tour anchors + state consumption, not a redesign).
- The 5 other pages using `<TopBar>` — zero code changes, since the button lives inside `TopBar` itself.
- `driver.js`'s own bundled CSS (`driver.js/dist/driver.css`) is imported as-is for base layout/positioning mechanics (arrow placement, overlay, stage cutout) — only the popover's *look* (colors, fonts, button style) is overridden, not its structural CSS.

## Self-Review Notes

- Placeholder scan: none — every step's title/description is real, final copy; every file edit shows exact current line numbers and full surrounding code, read directly from the actual files during this session (including a live fetch of `driver.js`'s current docs for its exact API and CSS class names, not from training-data memory).
- Internal consistency: the role-gating logic in `productTour.ts` is explicitly derived from, and cross-referenced against, the exact same conditionals in `Sidebar.tsx` — checked side by side, not assumed to match.
- Scope check: single cohesive feature (one library, one new file, four small edits to existing files), appropriately sized for one implementation plan.
- Ambiguity check: "bubbles" resolved to `driver.js`'s standard tooltip-popover-with-spotlight-cutout pattern, confirmed against the user's approved design summary before writing this spec.
