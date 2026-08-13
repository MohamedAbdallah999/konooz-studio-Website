# Extractable design components

## Application sidebar
- Source: `frontend/src/components/Shell.tsx`
- Scope: wordmark, primary navigation, active state, sign-out action, desktop rail dimensions, and tablet-to-mobile transition.
- Reusable as: an authenticated application navigation shell.

## Top status bar
- Source: `frontend/src/components/Shell.tsx`
- Scope: atelier label, greeting, and live sync status action.
- Reusable as: a page-level application header.

## Mobile bottom navigation
- Source: `frontend/src/components/Shell.tsx`
- Scope: five destinations/actions with active and sign-out states.
- Reusable as: compact authenticated navigation below 901px.

## Page section heading
- Sources: `frontend/src/components/AnimatedTitle.tsx` and page section headings.
- Reusable as: eyebrow, animated title, supporting copy, and optional primary action.

## Form number field
- Source: `frontend/src/components/NumberInput.tsx`
- Reusable as: numeric input with zero-select and wheel protection.

