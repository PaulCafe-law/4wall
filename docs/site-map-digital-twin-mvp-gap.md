# Site Map / Digital Twin MVP Gap

This sprint adds a web-only site map and digital twin MVP for incident operations. It stays inside the desktop operations surface and does not add any flight-control authority.

## Current State

- Incidents already expose `location` as JSON through `/v1/incidents`.
- Incident detail links incidents into a 3D site context.
- The web app has a `/site-map` MVP route with demo 2D/3D fallback rendering.
- The repository does not include a browser-loadable GLB or glTF model.
- The available source model is local Revit/Datasmith material under `D:\碩零(莊徐)\第四面牆長期資料夾\建築系工地\建研所`, which must not be hard-coded into runtime code.

## MVP Scope

- Add `/site-map` to the authenticated web app.
- Show incidents as 2D/3D markers using existing incident location data.
- Link Incident Detail to `/site-map?incidentId=<id>`.
- Extend incident location DTO/types with optional map anchor fields.
- Use a deterministic fallback layout when incidents lack 2D/3D coordinates.
- Show a professional placeholder model when `/models/site-model.glb` is absent.
- Add a map selector for multiple operational site contexts. The first extra
  site is `bri` for 建研所 and loads `/models/bri-site-model.glb` when that
  deployable web asset exists.

## Out of Scope

- Android and flight-critical runtime changes.
- Server-issued flight commands, virtual-stick control, or autonomous flight decisions.
- Native Revit parsing in the web app or planner server.
- Committing `.rvt`, `.udatasmith`, `.udsmesh`, or other large authoring/source model files.
- A new spatial-anchor database table or Alembic migration.
- BIM element picking or authoritative Revit object synchronization.

## Data Contract

The existing incident `location_json` field remains the persistence boundary. The MVP adds optional fields:

- `anchorId`
- `floorplanX`
- `floorplanY`
- `ifcGuid`
- `revitElementId`

Existing fields remain valid:

- `worldX`
- `worldY`
- `worldZ`
- `cameraId`
- `modelObjectId`

The web app should tolerate missing fields and display useful fallback positions instead of question marks or empty panels.

## Web Model Asset Slots

The viewer must not read Revit or Datasmith files at runtime. It only reads
browser-loadable assets from public URLs:

- default demo map: `/models/site-model.glb`
- 建研所 map: `/models/bri-site-model.glb`

The local 建研所 source folder remains an offline export source only:

`D:\碩零(莊徐)\第四面牆長期資料夾\建築系工地\建研所`

If `bri-site-model.glb` is not present, `/site-map?map=bri` should still render a
建研所-specific placeholder so staging demos are never blank. That placeholder is
only a visual stand-in based on the Unreal reference view: open courtyard,
perimeter walls, right-side vertical facade fins, central dark service volume,
door marker, and a small temporary railing. Exact geometry, materials, scale, and
object IDs require exporting the Revit/Unreal model to GLB and placing it in the
asset slot above.

## Safety Boundary

The site map is an operations and incident-review surface only. It may visualize sites, incidents, and future model anchors, but it must not create a flight-critical feedback loop or issue aircraft commands.
