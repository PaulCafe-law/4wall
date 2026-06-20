# Rent House 3DGS Site Map Gap

This sprint adds a web-only `rent-house` site map for visual quality comparison against the existing BRI GLB site map. It stays inside the desktop operations surface and does not add any flight-control authority.

## Current State

- `/site-map` already supports multiple map configs and loads the BRI model from `/models/bri-site-model.glb`.
- The BRI deployable GLB is about 4.39 MB and is committed as a static web asset.
- The rent house source is a private local Gaussian Splat PLY named `rent_house.ply`.
- The PLY is about 461.51 MB, binary little endian, and contains 3,456,590 splats.
- The PLY is too large and too sensitive to commit, ship in Docker, or expose through a public static URL.

## Target State

- `租屋處` appears as a selectable site map in `/site-map`.
- The rent house model is a SuperSplat-cropped `.sog` asset stored in private R2.
- Authenticated internal users request a short-lived model URL from the API before the web viewer loads the SOG.
- Customer org users do not see or load the private rent house model by default.
- The page can show the model even when there are no incident markers, because the first goal is visual comparison.

## Asset Workflow

1. Open the source PLY in PlayCanvas SuperSplat.
2. Crop floaters, edge noise, and unused dead zones.
3. Export `rent-house.v1.sog`.
4. Upload the SOG outside git to private R2 under `site-map-assets/rent-house/v1/rent-house.v1.sog`.
5. Configure production API with `BUILDING_ROUTE_SITE_MAP_RENT_HOUSE_SOG_KEY` pointing at that R2 key.

## Asset Evidence

- Source PLY: `483,923,457` bytes, `3,456,590` splats.
- Working hardlink: `.tmp/rent-house-3dgs/rent_house_source.ply`.
- SuperSplat runtime: `v2.27.4`; SplatTransform in SuperSplat: `v2.5.1`.
- Crop box: min `[-6, -5, -2]`, max `[5, 6, 4]`.
- Exported SOG: private local file `rent-house.v1.sog`, intended R2 key `site-map-assets/rent-house/v1/rent-house.v1.sog`.
- Output size: `35,242,781` bytes, about `33.61 MiB`.
- Output splats after crop and invalid-value removal: `3,062,507`.
- Output SHA256: `C737000CFA988AC0211694CA5A388E9539BEC07672C15A6692EF1823634C513A`.
- Local evidence screenshots are kept out of git under `.tmp/rent-house-3dgs/`.

## Out of Scope

- Committing `rent_house.ply`, `.sog`, screenshots, or other large private model assets.
- Replacing the BRI GLB workflow.
- Automatic visual quality scoring.
- Spatial-anchor persistence, BIM object picking, or Revit synchronization.
- Android, waypoint generation, aircraft control, or any flight-critical loop.
- Streamed SOG / LOD unless the single SOG is too large or slow after first production validation.

## Security Boundary

The rent house model represents a private indoor space. The web app must not load it from a public static path. Access goes through the existing web auth boundary, and the backend returns a short-lived R2/S3 GET URL only for internal users.
