# Official Site Generated Hero Gap Analysis

## Scope

Replace only the Chinese `/official` hero image with a project-owned generated
illustration. Keep the English `/official/en` image, page structure, copy,
animation, routing, and behavior unchanged.

## Current Gap

- The Chinese hero currently uses a bright surveillance-style factory photo.
- Its overexposed entrance and camera-like treatment compete with the product
  positioning and can be mistaken for a live monitoring frame.
- The image does not clearly connect cameras, machine data, on-premise AI,
  the 3D factory model, and LINE notifications in one visual.

## Target

- Use a deliberately non-photographic 3D editorial illustration.
- Show existing injection-molding equipment observed by a camera and connected
  to an edge AI node, a 3D factory model, and a restrained mobile notification.
- Follow the official-site palette: warm paper, oxidized teal, charcoal, and a
  small rust-orange alert accent.
- Include no logos, words, numbers, watermarks, or readable fake UI.
- Store the final optimized WebP in `web-app/public/official-assets/`.

## Guard Boundary

Allowed changes:

- `docs/official-generated-hero-gap-analysis.md`
- Chinese hero asset and its direct component/test references under `web-app/`

Explicitly excluded:

- English hero asset or `/official/en` content
- API, LINE, camera workers, authentication, and deploy configuration
- Marketing layout, typography, CTA, animation, and route changes

## Verification

- Unit test asserts the Chinese hero uses the new generated asset and dimensions.
- English hero remains `/official-assets/warroom-live.webp`.
- Lint, typecheck, focused tests, and production build pass.
- Desktop and mobile screenshots show correct crop, no overflow, and no broken
  image.
- Production `/official` serves the new asset while `/official/en` remains
  unchanged.
