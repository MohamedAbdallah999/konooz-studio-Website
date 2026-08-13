# Konooz Studio design system

## Visual character

A restrained luxury atelier interface: editorial serif display type, compact geometric interface copy, deep ink navigation, warm ivory content surfaces, champagne-gold accents, hairline borders, and minimal radii.

## Tokens

- Ink: `#171511`
- Espresso: `#2A2118`
- Gold: `#B8963E`
- Champagne: `#D4B968`
- Ivory: `#F7F1E6`
- White: `#FFFDF8`
- Line: `#DED5C5`
- Muted: `#746D62`
- Interface font: Manrope
- Display font: Cormorant Garamond

## Sidebar rules

- Desktop-only at 901px and above; mobile keeps the current five-item bottom navigation.
- The rail is fixed to the desktop viewport and remains visible while page content scrolls.
- The rail must occupy the full viewport height without horizontal overflow.
- Wordmark, navigation, and sign-out action share one deliberate alignment axis.
- Every item has an unambiguous 44px-or-taller target and consistent icon/label spacing.
- Active state uses champagne text and a gold positional accent without changing item geometry.
- Content must start after the rail and remain fluid from 901px through wide desktop sizes.
- Keep the existing navigation labels, icons, routes, and sign-out behavior.

## Interaction and accessibility

- Preserve visible keyboard focus.
- Maintain sufficient contrast on the ink surface.
- Use subtle transitions and honor reduced-motion settings.
- Do not alter the authenticated route hierarchy or mobile navigation behavior.
