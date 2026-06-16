# Industrial Data Engine NanoGS Unreal Import

## Scope

This note documents how to preview Industrial Data Engine `world_asset.spz` outputs in Unreal Engine with NanoGS. This is a visualization path only. Gaussian splats are not collision meshes and must not be used as flight-critical geometry.

## Current Local Setup

- Unreal project: `D:\ue_mcp_project\construction_site_v1.uproject`
- Unreal version: `5.7`
- NanoGS plugin: `D:\ue_mcp_project\Plugins\NanoGS`
- Source assets:
  - `D:\ue_mcp_project\SourceAssets\NanoGS\world_asset.spz`
  - `D:\ue_mcp_project\SourceAssets\NanoGS\world_asset_nanogs_full_1_92m.ply`
  - `D:\ue_mcp_project\SourceAssets\NanoGS\world_asset_nanogs_preview_500k.ply`
  - `D:\ue_mcp_project\SourceAssets\NanoGS\metadata.json`

`world_asset_nanogs_preview_500k.ply` is the recommended first import because it is smaller and faster to validate in-editor. Use `world_asset_nanogs_full_1_92m.ply` after scale, orientation, and material settings are confirmed.

## Conversion

The production job exports `world_asset.spz`. NanoGS imports Gaussian Splat PLY, so the SPZ is converted with PlayCanvas `splat-transform`.

```powershell
npx --yes @playcanvas/splat-transform -w .tmp\nanogs-import\world_asset.spz --filter-nan .tmp\nanogs-import\world_asset_nanogs.ply --summary
npx --yes @playcanvas/splat-transform -w .tmp\nanogs-import\world_asset.spz --filter-nan --decimate 500000 .tmp\nanogs-import\world_asset_nanogs_preview_500k.ply --summary
```

The successful production smoke asset converted to:

- Full: 1.92M splats, about 102.5 MB PLY.
- Preview: 500K splats, about 26.7 MB PLY.

## Unreal Import

1. Open `D:\ue_mcp_project\construction_site_v1.uproject` with UE 5.7.
2. Confirm the `NanoGS` plugin is enabled.
3. Use the NanoGS import button to import:
   `D:\ue_mcp_project\SourceAssets\NanoGS\world_asset_nanogs_preview_500k.ply`
4. Drag the generated Gaussian Splat Asset into the level.
5. If the preview looks correct, import:
   `D:\ue_mcp_project\SourceAssets\NanoGS\world_asset_nanogs_full_1_92m.ply`
6. Adjust NanoGS asset settings:
   - `Opacity Scale`
   - `Splat Scale`
   - `Sort Every Nth Frame`
   - `Enable Frustum Culling`
   - `LOD Error Threshold`

Useful NanoGS debug commands:

```text
gs.ShowClusterBounds 1
gs.DebugForceLODLevel 1
gs.MaxRenderBudget 3000000
```

## Caveats

- Gaussian splats are visual assets. Add separate proxy meshes if collision, navigation, or physics are needed.
- Large single PLY files can be expensive to sort. NanoGS recommends splitting large scenes into smaller pieces for best culling and sorting behavior.
- If TSR creates transparent ghosting, switch the project anti-aliasing to FXAA for diagnosis.

## Sources

- NanoGS: https://github.com/TimChen1383/NanoGaussianSplatting
- PlayCanvas splat-transform: https://github.com/playcanvas/splat-transform
