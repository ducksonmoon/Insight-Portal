# UI patterns — Insight Portal

Short conventions for consistent B2B pages.

## Page chrome

Use `PageHeader` from `src/components/layout/page-header.tsx`:

- Optional breadcrumbs
- `page-title` + `page-subtitle`
- Right-side actions (buttons)

Empty lists use `EmptyState` (title + description + optional CTA).

## Surfaces

Prefer:

- `.surface-panel` / `.surface-panel-header` / `.surface-panel-body` for forms and detail panes
- `.list-panel` + `.action-row` for navigable lists
- `.filter-panel` for report parameters

Avoid inventing new card grids for primary content.

## Forms

Use `.input-field` (or `Input` / `Select` / `Textarea` components). Labels use `.field-label`.

## Feedback

Use `useToast()` for success/error and confirmations. Do not call `window.alert` / `window.confirm` / `window.prompt`. Use `Dialog` from `src/components/ui/dialog.tsx` for modal forms.

## Tokens

Colors and radius live in `globals.css` (`:root`). Prefer `var(--primary)`, `var(--radius)`, etc. Charts and AG Grid should read CSS variables so branding recolor works.

## Typography

- Page: `.page-title` / `.page-subtitle`
- Section: `.section-title` / `.section-desc`
- Body base: 15px Vazirmatn
