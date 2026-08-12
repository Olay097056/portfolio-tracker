# 09 — Task: Office 3D scene

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 02, 07

## Answer

Office 3D — commit `2867f78`

**Scene**: Canvas + OrbitControls + grid floor + 12 rooms (box geometry, wireframe, colored)
- Room labels (drei Text) + 3 character spheres per room
- Click room → info card (status, data from live services)
- Job runs panel (GET /api/jobs/status, 30s polling)
- Running indicator (pulse animation)
- Instructions overlay

**Dep**: @react-three/fiber + @react-three/drei
**Tests**: 2 passed · vitest **559** · tsc clean
