# GPU LOD and visual system

Phase 05 extends the compacted visibility stream into three independent, capacity-safe regions.
Every region reserves `capacity × 4` bytes, so any distribution—including every instance choosing
one LOD—remains valid. Three 16-byte counter records and three tightly packed 20-byte indexed
indirect records complete the layout. At one million capacity, tracked state is 92,000,108 bytes.

## Classification

The culling shader computes a conservative sphere radius, transforms its center to view space, and
estimates projected radius in physical pixels:

```text
radiusPixels = radiusWorld × projectionYScale × viewportHeight × 0.5 / viewDepth
```

Defaults are near at 8 px or larger, mid at 2 px, far at 0.35 px, and culled below 0.35 px. A stable
per-instance hash spreads each boundary across ±8%. This deterministic transition band distributes
switches during slow camera movement without storing previous-frame LOD state. Individual geometry
changes can still occur; the remaining pop is accepted in exchange for avoiding another persistent
state buffer and synchronization pass.

## Geometry contract

| LOD | Representation          | Vertices | Indices | Triangles | First index | Base vertex | Bound |
| --- | ----------------------- | -------: | ------: | --------: | ----------: | ----------: | ----: |
| 0   | Authored low-poly drone |        8 |      36 |        12 |           0 |           0 |   1.5 |
| 1   | Simplified wedge        |        5 |      18 |         6 |          36 |           8 |   1.5 |
| 2   | Camera-facing quad      |        4 |       6 |         2 |          54 |          13 |    √2 |

All geometry shares one vertex and one index buffer. Finalization writes these ranges on the GPU,
and the render pass issues exactly three swarm indirect draws; zero instance counts require no CPU
branch. LOD list selection uses `LOD_INDEX × capacity + instance_index`.

Near and mid orientation derives a full orthonormal basis from velocity. Near-zero speed falls back
to the deterministic stored heading; near-vertical velocity switches the reference-up axis to avoid
a degenerate cross product. Far geometry reconstructs camera right/up from the view matrix and does
not store matrices per instance.

Far sprites are opaque emissive quads with depth testing/writes. This avoids transparency sorting
and makes the cost predictable. Directional/rim lighting, fog, procedural background, attractor
marker, and LOD debug colors are inexpensive and independently controllable. No bloom or other
post-processing is present.

Development controls mutate the persistent global uniform block only: auto/fixed LOD, thresholds,
LOD colors, background, fog, and marker. They do not recreate pipelines, bind groups, or buffers.
Public controls retain population, interaction, pause/reset, benchmark entry, render scale, and a
clean capture mode. Escape exits capture mode while metrics remain visible.
