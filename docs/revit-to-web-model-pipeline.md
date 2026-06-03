# Revit To Web Model Pipeline

The current Revit/Datasmith source material is stored outside the repo:

`D:\碩零(莊徐)\第四面牆長期資料夾\建築系工地\建研所`

Observed source files:

- `建研所.rvt`
- `建研所-穿越-Walkthrough_2.udatasmith`
- `建研所-穿越-Walkthrough_2_Assets\`

These files are authoring/export sources, not deployable web assets. Do not commit them to the repo and do not reference this local path from runtime code.

## Recommended MVP Export

1. Open the model in Revit, Twinmotion, Unreal/Datasmith tooling, Blender, or another trusted conversion workflow.
2. Reduce geometry for web use:
   - remove nonessential detail
   - merge static meshes where practical
   - compress textures
   - keep the model origin and scale documented
3. Export a browser-friendly asset:
   - preferred: `site-model.glb`
   - acceptable later: glTF + external textures, IFC, or 3D tiles
4. Place the optimized file at:
   - `web-app/public/models/site-model.glb`
   - for the 建研所 map: `web-app/public/models/bri-site-model.glb`
5. Keep generated GLB size small enough for normal web loading. If the file is too large for git, host it on object storage/CDN and configure the viewer URL separately.

## Coordinate Convention

The MVP viewer treats incident coordinates as local model coordinates:

- `worldX`: horizontal model X
- `worldY`: vertical height
- `worldZ`: horizontal model Z
- `floorplanX`: normalized or pixel X on the 2D floorplan
- `floorplanY`: normalized or pixel Y on the 2D floorplan

If an incident lacks coordinates, the web app uses deterministic fallback placement so the operations view remains usable.

## 建研所 Site Map Slot

The web app exposes the 建研所 site context at:

`/site-map?map=bri`

This route looks for:

`/models/bri-site-model.glb`

If that GLB is absent, the page intentionally renders a 建研所-specific schematic
placeholder. Do not copy `.rvt`, `.udatasmith`, `.udsmesh`, or the Datasmith
asset folder into the web app. Those files remain local authoring/export inputs
only.

### Current BRI Export

The first deployable GLB was generated locally through Unreal Engine 5.7:

- source: `建研所-穿越-Walkthrough_2.udatasmith`
- output: `web-app/public/models/bri-site-model.glb`
- exporter: Unreal Engine GLTFExporter
- output size: about 4.6 MB
- scene contents: 297 nodes, 190 meshes, 28 materials

The Datasmith import completed and produced a usable GLB, but Unreal reported a
handled material-index ensure during import. Treat this first GLB as a web MVP
model: visually verify it against Unreal/Revit before relying on it for exact BIM
element picking or measurement.

## Future Work

- Add a spatial-anchor table when anchors become shared durable data instead of embedded incident JSON.
- Store model metadata such as scale, origin, floor transforms, and source revision.
- Map `ifcGuid`, `revitElementId`, or `modelObjectId` to clickable BIM elements.
- Add object picking and camera presets after the GLB pipeline is stable.
