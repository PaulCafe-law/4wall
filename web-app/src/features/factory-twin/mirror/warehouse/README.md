# Warehouse Simulation Notes

This module is a front-end-only digital twin sandbox for warehouse slotting and AGV routing what-if analysis.

## Route Visualization

The route overlay in `src/components/warehouse/WarehouseSimulator.tsx` draws the real `RoutingResult.routes[].waypoints` returned by `routeOrders()`. It is not a decorative sample path.

- Single AGV mode shows one selected AGV's full route, distance, assigned order count, pick count, and waypoint count.
- All AGV mode draws every route with a distinct mid-century color at lower opacity.
- The SVG viewBox uses the same column/row coordinate system as `layout.cells`, `StorageSlot.point`, `layout.agvStart`, and `layout.dock`.
- Routes currently keep full waypoint arrays. If a future scenario creates very large routes, downsampling should be explicit in the UI.

## Routing Heuristic

The routing layer is intentionally heuristic:

- `nn`: nearest-neighbor pick ordering per order.
- `nn-2opt`: nearest-neighbor followed by bounded 2-opt improvement.
- Orders are assigned to the least-busy AGV, then routed with Manhattan legs and a dock return.
- 2-opt has iteration and time budgets to keep seeded what-if runs interactive.

This is enough for the current pitch goal: compare slotting strategies, show AGV travel distance changes, and reveal peak-load bottlenecks. Future upgrades can add batch picking, zone picking, congestion-aware routing, real AGV telemetry, and live WMS connectors without changing the simulator UI contract.
