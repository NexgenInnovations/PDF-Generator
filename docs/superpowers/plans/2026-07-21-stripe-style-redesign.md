# Stripe-Style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Dashboard and TemplateList pages (plus their shared layout shell and UI primitives) from the current mixed editorial/neon-glow styling to the approved Stripe-style visual direction, with no functional changes.

**Architecture:** Bottom-up: design tokens first (`index.css`), then shared primitives (`button.tsx`, `badge.tsx`, `card.tsx`), then layout shell (`Sidebar.tsx`, `TopBar.tsx`), then the two pages (`Dashboard.tsx`, `TemplateList.tsx`). Each task only touches its own layer, and later tasks consume tokens/components defined by earlier tasks — so tasks must land in this order.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS v4 (CSS-based config via `client/src/index.css`, no `tailwind.config.*` file), `class-variance-authority` for variant components, `lucide-react` icons. No test runner exists in `client/` — verification is manual: typecheck plus starting the dev server and visually checking each page in a browser, per this project's established practice for frontend work.

## Global Constraints

- Pure visual restyle — no functional/data changes. All existing props, API calls, routing, and role-based visibility logic (`useRole()`, `canEdit`, `canDelete`, `canFill`) must be preserved exactly.
- Design tokens (CSS custom properties in `client/src/index.css`):
  - Surfaces: `--nx-canvas: #ffffff`, `--nx-surface: #f7fafc`, `--nx-surface-tint: #f5f3ff`, `--nx-hairline: #e3e8ef`
  - Ink: `--nx-ink: #0a2540`, `--nx-ink-secondary: #425466`, `--nx-ink-muted: #8792a2`
  - Accent: `--nx-accent: #635bff`, `--nx-accent-tint: #f5f3ff`
  - Semantic: `--nx-success: #0e6245`, `--nx-success-tint: #e3f9e5`, `--nx-destructive: #dc2626`, `--nx-destructive-tint: #fef2f2`
  - Shape: `--nx-radius-sm: 6px`, `--nx-radius-md: 8px`
- No pill shapes (`border-radius: 50px`), no `Geist Mono` uppercase-eyebrow labels, no `BLOCK_COLORS`/pastel-block backgrounds anywhere in the two in-scope pages after this pass.
- Out of scope, must NOT be touched: `client/src/pages/TemplateDesigner.tsx`, `client/src/pages/FormFill.tsx`, `client/src/pages/NotFound.tsx`, the embedded pdfme `Designer` canvas.
- No new dependencies.

---

## File Structure

- **Modify:** `client/src/index.css` — replace `:root` tokens, remove `.nx-block-*`/`.nx-mono` helpers.
- **Modify:** `client/src/components/ui/button.tsx` — new variant styles using the tokens.
- **Modify:** `client/src/components/ui/badge.tsx` — new variant styles using the tokens.
- **Modify:** `client/src/components/ui/card.tsx` — new base styles using the tokens.
- **Modify:** `client/src/components/ui/tooltip.tsx` — new base styles using the tokens.
- **Modify:** `client/src/components/layout/Sidebar.tsx` — restyle nav/logo/footer.
- **Modify:** `client/src/components/layout/TopBar.tsx` — restyle header/search/CTA.
- **Modify:** `client/src/pages/Dashboard.tsx` — restyle stat cards and recent-templates section.
- **Modify:** `client/src/pages/TemplateList.tsx` — restyle filter bar, grid/list views, empty/error/skeleton states.

---

### Task 1: Design tokens

**Files:**
- Modify: `client/src/index.css`

**Interfaces:**
- Produces: CSS custom properties (`--nx-canvas`, `--nx-surface`, `--nx-surface-tint`, `--nx-hairline`, `--nx-ink`, `--nx-ink-secondary`, `--nx-ink-muted`, `--nx-accent`, `--nx-accent-tint`, `--nx-success`, `--nx-success-tint`, `--nx-destructive`, `--nx-destructive-tint`, `--nx-radius-sm`, `--nx-radius-md`) consumed by every later task via inline `style={{ ... }}` or `var(--nx-*)` in Tailwind arbitrary values.

- [ ] **Step 1: Replace the `:root` token block**

Replace lines 11-51 of `client/src/index.css` (from `:root {` through its closing `}`) with:

```css
:root {
  /* Surfaces */
  --nx-canvas:        #ffffff;
  --nx-surface:       #f7fafc;
  --nx-surface-tint:  #f5f3ff;  /* active/selected nav background */
  --nx-hairline:      #e3e8ef;

  /* Ink */
  --nx-ink:            #0a2540;  /* headings, primary text */
  --nx-ink-secondary:  #425466;  /* body text */
  --nx-ink-muted:      #8792a2;  /* labels, captions, placeholders */

  /* Accent */
  --nx-accent:         #635bff;  /* primary actions, active states */
  --nx-accent-tint:    #f5f3ff;  /* light accent background (badges, active nav) */

  /* Semantic */
  --nx-success:        #0e6245;
  --nx-success-tint:   #e3f9e5;
  --nx-destructive:    #dc2626;
  --nx-destructive-tint: #fef2f2;

  /* Shape */
  --nx-radius-sm: 6px;
  --nx-radius-md: 8px;

  /* Tailwind semantic tokens (kept in sync with the above) */
  --background:        0 0% 100%;
  --foreground:        210 55% 10%;
  --card:              0 0% 100%;
  --card-foreground:   210 55% 10%;
  --popover:           0 0% 100%;
  --popover-foreground:210 55% 10%;
  --primary:           245 100% 68%;
  --primary-foreground:0 0% 100%;
  --secondary:         220 20% 97%;
  --secondary-foreground:210 25% 32%;
  --muted:             220 20% 97%;
  --muted-foreground:  216 12% 55%;
  --accent:            256 100% 97%;
  --accent-foreground: 245 100% 68%;
  --destructive:       0 72% 51%;
  --destructive-foreground:0 0% 100%;
  --border:            216 20% 91%;
  --input:             0 0% 100%;
  --ring:              245 100% 68%;
  --radius:            0.5rem;
}
```

- [ ] **Step 2: Remove the unused pastel/mono helper classes**

Delete these blocks entirely from `client/src/index.css`:

```css
/* ── Monotype eyebrow / caption helpers ── */
.nx-mono {
  font-family: 'Geist Mono', 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
```

and

```css
/* ── Color block helpers ── */
.nx-block-lime   { background: #dceeb1; color: #000; }
.nx-block-lilac  { background: #c5b0f4; color: #000; }
.nx-block-cream  { background: #f4ecd6; color: #000; }
.nx-block-pink   { background: #efd4d4; color: #000; }
.nx-block-mint   { background: #c8e6cd; color: #000; }
.nx-block-coral  { background: #f3c9b6; color: #000; }
.nx-block-navy   { background: #1f1d3d; color: #fff; }
```

Before deleting, confirm neither class is referenced anywhere outside `index.css`:

```bash
grep -rn "nx-mono\|nx-block-" client/src --include="*.tsx" --include="*.ts"
```

Expected: no matches (both classes are dead code as of this plan's base commit — Dashboard/TemplateList are the only consumers historically, and Task 8/9 remove their usages in the same pass regardless). If the grep finds matches outside `Dashboard.tsx`/`TemplateList.tsx`, stop and report — that means a page outside this plan's scope depends on these classes and they cannot be deleted yet.

Leave every other block in `client/src/index.css` (reset, body, scrollbar, route-transition animations, loading animations, focus ring) untouched.

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (CSS changes don't affect TS compilation, but this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css
git commit -m "feat(design): replace editorial tokens with Stripe-style tokens"
```

---

### Task 2: Button component

**Files:**
- Modify: `client/src/components/ui/button.tsx`

**Interfaces:**
- Consumes: `--nx-accent`, `--nx-hairline`, `--nx-ink`, `--nx-ink-secondary`, `--nx-destructive`, `--nx-radius-sm` tokens from Task 1.
- Produces: `Button` component with variants `default | destructive | outline | secondary | ghost | link` and sizes `default | sm | lg | icon` — same public API (`ButtonProps`, `buttonVariants`) as before, only the variant class strings change. Later tasks (5-8) consume `<Button variant="..." size="...">`.

- [ ] **Step 1: Replace `buttonVariants`**

Replace lines 6-36 of `client/src/components/ui/button.tsx` (the `buttonVariants` call) with:

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--nx-radius-sm)] text-sm font-semibold ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nx-accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--nx-accent)] text-white hover:brightness-110 active:scale-[0.98]',
        destructive:
          'bg-[var(--nx-destructive)] text-white hover:brightness-110',
        outline:
          'border border-[var(--nx-hairline)] bg-transparent text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)]',
        secondary:
          'bg-white text-[var(--nx-ink)] border border-[var(--nx-hairline)] hover:bg-[var(--nx-surface)]',
        ghost:
          'text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)] hover:text-[var(--nx-ink)]',
        link:
          'text-[var(--nx-accent)] underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-[var(--nx-radius-sm)] px-3 text-xs',
        lg: 'h-11 rounded-[var(--nx-radius-sm)] px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

Leave the rest of the file (imports, `ButtonProps`, `Button` forwardRef implementation, exports) unchanged.

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/button.tsx
git commit -m "feat(design): restyle Button component to Stripe-style tokens"
```

---

### Task 3: Badge component

**Files:**
- Modify: `client/src/components/ui/badge.tsx`

**Interfaces:**
- Consumes: `--nx-hairline`, `--nx-ink-secondary`, `--nx-accent`, `--nx-accent-tint`, `--nx-success`, `--nx-success-tint`, `--nx-destructive`, `--nx-destructive-tint`, `--nx-radius-sm` tokens from Task 1.
- Produces: `Badge` component with variants `default | secondary | destructive | outline | success` — same public API (`BadgeProps`, `badgeVariants`) as before.

- [ ] **Step 1: Replace `badgeVariants`**

Replace lines 5-24 of `client/src/components/ui/badge.tsx` (the `badgeVariants` call) with:

```tsx
const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--nx-radius-sm)] px-2 py-0.5 text-xs font-medium transition-colors border',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--nx-accent-tint)] text-[var(--nx-accent)]',
        secondary:
          'border-[var(--nx-hairline)] bg-[var(--nx-surface)] text-[var(--nx-ink-secondary)]',
        destructive:
          'border-transparent bg-[var(--nx-destructive-tint)] text-[var(--nx-destructive)]',
        outline:
          'border-[var(--nx-hairline)] text-[var(--nx-ink-secondary)] bg-transparent',
        success:
          'border-transparent bg-[var(--nx-success-tint)] text-[var(--nx-success)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);
```

Leave the rest of the file unchanged.

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/badge.tsx
git commit -m "feat(design): restyle Badge component to Stripe-style tokens"
```

---

### Task 4: Card component

**Files:**
- Modify: `client/src/components/ui/card.tsx`

**Interfaces:**
- Consumes: `--nx-hairline`, `--nx-ink`, `--nx-radius-md` tokens from Task 1.
- Produces: `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` — same public API as before, only `Card`'s base `className` string changes.

- [ ] **Step 1: Replace `Card`'s base classes**

Modify `client/src/components/ui/card.tsx:4-16`:

```tsx
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--nx-radius-md)] border border-[var(--nx-hairline)] bg-white text-[var(--nx-ink)]',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';
```

(This drops `transition-all duration-150 hover:border-black/20` per the spec — cards are static containers in the Stripe direction, not interactive elements.)

Also update `CardTitle` (`client/src/components/ui/card.tsx:25-34`) and `CardDescription` (`client/src/components/ui/card.tsx:36-42`) to use the new ink tokens instead of hardcoded black:

```tsx
const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-xl font-bold leading-none tracking-tight text-[var(--nx-ink)]', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-[var(--nx-ink-muted)]', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';
```

Leave `CardHeader`, `CardContent`, `CardFooter`, and all exports unchanged.

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/card.tsx
git commit -m "feat(design): restyle Card component to Stripe-style tokens"
```

---

### Task 5: Tooltip component

**Files:**
- Modify: `client/src/components/ui/tooltip.tsx`

**Interfaces:**
- Consumes: `--nx-hairline`, `--nx-ink` tokens from Task 1.
- Produces: `Tooltip`/`TooltipTrigger`/`TooltipContent`/`TooltipProvider` — same public API as before (all re-exported from `@radix-ui/react-tooltip`), only `TooltipContent`'s `className` string changes.

- [ ] **Step 1: Replace `TooltipContent`'s dark neon-glow styling**

Modify `client/src/components/ui/tooltip.tsx:12-22`:

```tsx
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-[var(--nx-radius-sm)] border px-3 py-1.5 text-xs shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      className
    )}
    style={{ background: 'var(--nx-ink)', borderColor: 'var(--nx-ink)', color: '#ffffff' }}
    {...props}
  />
));
```

(A dark tooltip on a light-UI is the conventional pattern this direction calls for — using `--nx-ink` as a solid dark background with white text, rather than a light tooltip, for contrast against the mostly-white page.)

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/tooltip.tsx
git commit -m "feat(design): restyle Tooltip component to Stripe-style tokens"
```

---

### Task 6: Sidebar layout shell

**Files:**
- Modify: `client/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `--nx-hairline`, `--nx-ink`, `--nx-ink-secondary`, `--nx-ink-muted`, `--nx-accent`, `--nx-accent-tint`, `--nx-radius-sm` tokens from Task 1. No prop/export changes — `Sidebar` remains a zero-prop component.

- [ ] **Step 1: Restyle `NavItem`'s active/inactive classes**

Modify `client/src/components/layout/Sidebar.tsx:29-38` (inside the `NavLink`'s `className` callback):

```tsx
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors duration-150 rounded-[var(--nx-radius-sm)]',
                isActive
                  ? 'bg-[var(--nx-accent-tint)] text-[var(--nx-accent)]'
                  : 'text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)] hover:text-[var(--nx-ink)]'
              )
            }
```

- [ ] **Step 2: Restyle the logo mark and sidebar chrome**

Modify `client/src/components/layout/Sidebar.tsx:56-79` (the `<aside>` through the nav section's opening):

```tsx
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-white"
      style={{ borderRight: '1px solid var(--nx-hairline)' }}
    >
      {/* Logo */}
      <div
        className="flex h-16 items-center gap-3 px-5 shrink-0"
        style={{ borderBottom: '1px solid var(--nx-hairline)' }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)] shrink-0"
          style={{ background: 'var(--nx-accent)' }}
        >
          <FileText className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--nx-ink)' }}>PDF Manager</span>
          <span className="text-[11px]" style={{ color: 'var(--nx-ink-muted)' }}>
            Nexgen
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <p
          className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--nx-ink-muted)' }}
        >
          Navigation
        </p>
```

- [ ] **Step 3: Restyle the role-switcher and user footer**

Modify `client/src/components/layout/Sidebar.tsx:90-146` (the "User footer" block through the closing `</aside>`):

```tsx
      {/* User footer */}
      <div className="p-3 space-y-3" style={{ borderTop: '1px solid var(--nx-hairline)' }}>
        {/* Role switcher */}
        <div>
          <p
            className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--nx-ink-muted)' }}
          >
            Switch Role
          </p>
          <div className="flex gap-1">
            {(['Admin', 'Designer', 'FormFiller'] as const).map((r) => (
              <TooltipProvider key={r} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setRole(r)}
                      className={cn(
                        'flex-1 px-1 py-1 text-[11px] font-medium transition-colors duration-150 rounded-[var(--nx-radius-sm)]',
                        role === r
                          ? 'text-white'
                          : 'text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)] border border-[var(--nx-hairline)]'
                      )}
                      style={role === r ? { background: 'var(--nx-accent)' } : undefined}
                    >
                      {r === 'FormFiller' ? 'Filler' : r}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Switch to {r}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>

        {/* User row */}
        <div className="flex items-center gap-3 px-1">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs font-semibold text-white" style={{ background: 'var(--nx-ink)' }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--nx-ink)' }}>{role}</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--nx-ink-muted)' }}>
              Current role
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="transition-colors"
            style={{ color: 'var(--nx-ink-muted)' }}
            title="Home"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual verification**

```bash
cd client && npm run dev
```

(Start in background: `nohup npm run dev > /tmp/task5-dev.log 2>&1 & disown`, `sleep 5 && cat /tmp/task5-dev.log` for the port, then curl `/` for 200. Stop by PID via `lsof -ti:<port> | xargs -r kill` when done — never a blanket `pkill -f vite`.)

If a browser is available: open the app, confirm the sidebar shows a white background, indigo logo mark, indigo-tinted active nav item, gray secondary text for inactive items, and the role switcher/user footer use the new palette (no black pills). If no browser is available, reason through the JSX by inspection and describe the walkthrough in the report.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/layout/Sidebar.tsx
git commit -m "feat(design): restyle Sidebar to Stripe-style tokens"
```

---

### Task 7: TopBar layout shell

**Files:**
- Modify: `client/src/components/layout/TopBar.tsx`

**Interfaces:**
- Consumes: `--nx-hairline`, `--nx-ink`, `--nx-ink-muted`, `--nx-surface`, `--nx-radius-sm` tokens from Task 1, and `Button` from Task 2 (`../ui/button.js`).
- No prop changes — `TopBarProps` (`title`, `ctaLabel?`, `onCtaClick?`, `className?`) stays identical.

- [ ] **Step 1: Restyle the header and rewrite the CTA using `Button`**

Replace the full contents of `client/src/components/layout/TopBar.tsx`:

```tsx
import { Bell, Search } from 'lucide-react';
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

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Reuse the dev server pattern from Task 6 Step 3. Confirm the TopBar shows a white background, hairline bottom border, dark ink title, light-gray search input, hairline-bordered bell icon, and an indigo-filled CTA button (via the new `Button` component) matching the mockup.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/layout/TopBar.tsx
git commit -m "feat(design): restyle TopBar to Stripe-style tokens"
```

---

### Task 8: Dashboard page

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `--nx-*` tokens from Task 1, `Card`/`CardContent` from Task 4 (`../components/ui/card.js`), `Button` from Task 2 if needed for the empty-state CTA.
- No prop/route changes — `Dashboard` remains a zero-prop default export.

- [ ] **Step 1: Rewrite `StatCard` to use the new Card primitive**

Replace `client/src/pages/Dashboard.tsx:1-50` (imports through the end of `StatCard`):

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, TrendingUp, Clock, CheckCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--nx-ink-muted)' }}>
          {title}
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)]"
          style={{ background: 'var(--nx-accent-tint)' }}
        >
          <span style={{ color: 'var(--nx-accent)' }} className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--nx-ink)' }}>{value}</div>
        {description && (
          <p className="text-xs mt-1" style={{ color: 'var(--nx-ink-muted)' }}>
            {description}
          </p>
        )}
      </div>
    </Card>
  );
}
```

Note: `StatCard` drops the `color` prop entirely (the per-card pastel background is gone — every stat card now uses the same white `Card` surface with an indigo-tinted icon badge). Task 8 Step 2 updates all 4 call sites to remove the `color="..."` prop accordingly.

- [ ] **Step 2: Update `Dashboard`'s stat-card call sites and remaining JSX**

Replace `client/src/pages/Dashboard.tsx:52-209` (the `Dashboard` function body) with:

```tsx
export default function Dashboard() {
  const { role } = useRole();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const canEdit = role === 'Admin' || role === 'Designer';
  const recent = templates.slice(0, 6);

  return (
    <AppLayout>
      <TopBar
        title="Dashboard"
        ctaLabel={canEdit ? '+ New Template' : undefined}
        onCtaClick={canEdit ? () => navigate('/templates/new') : undefined}
      />

      <div className="p-6 space-y-8">
        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Templates"
            value={loading ? '—' : templates.length}
            icon={<FileText />}
            description="All time"
          />
          <StatCard
            title="Recent Activity"
            value={loading ? '—' : recent.length}
            icon={<TrendingUp />}
            description="Last 7 days"
          />
          <StatCard
            title="Your Role"
            value={role}
            icon={<CheckCircle />}
            description="Current session"
          />
          <StatCard
            title="Last Updated"
            value={
              loading || templates.length === 0
                ? '—'
                : (() => {
                    const t = templates.find((x) => x.updated_at);
                    return t?.updated_at
                      ? new Date(t.updated_at).toLocaleDateString()
                      : 'Never';
                  })()
            }
            icon={<Clock />}
            description="Most recent edit"
          />
        </div>

        {/* Recent templates */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--nx-ink)' }}>
              Recent Templates
            </h2>
            <button
              onClick={() => navigate('/templates')}
              className="text-xs font-medium transition-colors"
              style={{ color: 'var(--nx-accent)' }}
            >
              View all →
            </button>
          </div>

          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-[var(--nx-radius-md)] p-6 space-y-3 border"
                  style={{ background: 'var(--nx-surface)', borderColor: 'var(--nx-hairline)' }}
                >
                  <div className="h-3 rounded w-2/3" style={{ background: 'var(--nx-hairline)' }} />
                  <div className="h-2.5 rounded w-1/3" style={{ background: 'var(--nx-hairline)' }} />
                </div>
              ))}
            </div>
          )}

          {!loading && templates.length === 0 && (
            <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full mb-4"
                style={{ background: 'var(--nx-surface)' }}
              >
                <FileText className="h-6 w-6" style={{ color: 'var(--nx-ink-muted)' }} />
              </div>
              <p className="text-base font-semibold" style={{ color: 'var(--nx-ink)' }}>No templates yet</p>
              <p className="text-sm mt-1 mb-6" style={{ color: 'var(--nx-ink-muted)' }}>
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

          {!loading && templates.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((t) => (
                <Card
                  key={t.id}
                  className="cursor-pointer p-5 transition-colors hover:bg-[var(--nx-surface)]"
                  onClick={() => navigate(canEdit ? `/templates/${t.id}/edit` : `/templates/${t.id}/fill`)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--nx-radius-sm)]"
                      style={{ background: 'var(--nx-surface)' }}
                    >
                      <FileText className="h-4 w-4" style={{ color: 'var(--nx-ink-muted)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--nx-ink)' }}>{t.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--nx-ink-muted)' }}>
                        {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-[var(--nx-radius-sm)] text-[11px] font-medium"
                      style={{ background: 'var(--nx-surface)', color: 'var(--nx-ink-secondary)' }}
                    >
                      {t.updated_at ? 'Edited' : 'New'}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. This project's tsconfig has `noUnusedLocals`/`noUnusedParameters: true` — confirm `BLOCK_COLORS` (deleted) leaves no dangling reference and no unused imports remain.

- [ ] **Step 4: Manual verification**

Reuse the dev server pattern from Task 6 Step 3, checking the Dashboard route (`/`). Confirm: 4 stat cards in white `Card` surfaces with indigo icon badges (no pastel backgrounds), recent-templates cards in white with hairline borders (no `BLOCK_COLORS`), loading skeleton and empty state use the new surface/hairline tokens, and clicking a recent-template card still navigates correctly (role-based edit vs. fill routing unchanged). If no browser is available, reason through the JSX by inspection.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "feat(design): restyle Dashboard to Stripe-style tokens"
```

---

### Task 9: TemplateList page

**Files:**
- Modify: `client/src/pages/TemplateList.tsx`

**Interfaces:**
- Consumes: `--nx-*` tokens from Task 1, `Card` from Task 4, `Button` from Task 2, `Badge` from Task 3 (all via `../components/ui/*.js`).
- No prop/route changes — `TemplateList` remains a zero-prop default export; `handleDelete`, `canEdit`/`canDelete`/`canFill` logic unchanged.

- [ ] **Step 1: Rewrite the full file**

Replace the full contents of `client/src/pages/TemplateList.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. Confirm `BLOCK_COLORS` (deleted) leaves no dangling reference and no unused imports remain (this project's tsconfig has `noUnusedLocals`/`noUnusedParameters: true`).

- [ ] **Step 3: Manual verification**

Reuse the dev server pattern from Task 6 Step 3, checking the TemplateList route (`/templates`). Confirm: filter bar count label and grid/list toggle use the new tokens (indigo active state, no black pill), error banner uses the red tint, skeleton/empty states use surface/hairline tokens, grid-view cards drop the per-card pastel header (plain white card with indigo icon badge), list-view table uses the light-gray header row and hairline dividers, and all three role-gated actions (Fill/Edit/Delete) still render correctly per role and still perform their existing navigation/delete behavior. If no browser is available, reason through the JSX by inspection.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/TemplateList.tsx
git commit -m "feat(design): restyle TemplateList to Stripe-style tokens"
```

---

## Self-Review Notes

- **Spec coverage:** Every section of the spec has a corresponding task — tokens (Task 1), button/badge/card (Tasks 2-4), Sidebar/TopBar (Tasks 6-7), Dashboard (Task 8), TemplateList (Task 9). Tooltip (Task 5) was added during self-review after discovering `tooltip.tsx` still carried the old neon-glow theme and is used by both in-scope pages — not in the original spec, but a necessary consequence of it (spec's "no functional/data changes" and overall direction intent implies no visual regressions either). Out-of-scope files (`TemplateDesigner.tsx`, `FormFill.tsx`, `NotFound.tsx`, pdfme `Designer`) are never referenced by any task.
- **Placeholder scan:** No TBD/TODO; every step contains complete, exact code to write.
- **Type consistency:** `StatCard`'s prop shape (`title`, `value`, `icon`, `description?` — `color` removed) is defined once in Task 8 Step 1 and consumed consistently across all 4 call sites in Task 8 Step 2. `Button`/`Badge`/`Card`/`Tooltip*` public APIs are unchanged from their pre-existing shapes in Tasks 2-5, so Tasks 7-9's usage (`<Button variant="..." size="...">`, `<Card className="...">`) matches without needing new type imports beyond what's already specified. Token names (`--nx-ink`, `--nx-ink-secondary`, `--nx-ink-muted`, `--nx-accent`, `--nx-accent-tint`, `--nx-surface`, `--nx-hairline`, `--nx-radius-sm`, `--nx-radius-md`, `--nx-success`/`--nx-success-tint`, `--nx-destructive`/`--nx-destructive-tint`) are used identically across every task, matching Task 1's definitions exactly.
- **Task ordering:** Tasks are strictly bottom-up (tokens → primitives → layout shell → pages) so each task's dependencies are already committed by the time it's dispatched — no forward references.
