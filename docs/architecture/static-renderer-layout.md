# Static renderer layouts

Phase 02 deliberately uses the smallest complete direct-instancing path. All buffers are created during renderer initialization and survive until scene destruction.

## Drone geometry

The low-poly drone is authored directly in `DroneMesh.ts`; no external asset or license is required. It has 8 vertices, 36 `uint16` indices, and 12 triangles.

| Vertex field | WGSL type   | Byte offset | Bytes |
| ------------ | ----------- | ----------: | ----: |
| position     | `vec3<f32>` |           0 |    12 |
| normal       | `vec3<f32>` |          12 |    12 |

The interleaved vertex stride is 24 bytes. Its conservative object-space bounding sphere radius is `1.5`; later culling multiplies this by instance scale.

## Static instance Structure of Arrays

| Buffer              | Element type | Bytes/instance | Meaning                                  |
| ------------------- | ------------ | -------------: | ---------------------------------------- |
| positions and scale | `vec4<f32>`  |             16 | world position xyz, uniform scale        |
| appearance          | `vec4<u32>`  |             16 | packed RGBA, heading bits, seed, variant |

The fixed seed is `0x5a17c9e3`. Generation and bounded chunk uploads happen before animation starts. Phase 02 has no velocity buffer because simulation begins in Phase 03.

## Global uniform block

The persistent block reserves 256 bytes and writes only its 224 used bytes per frame.

| Field              | Float offset | Byte offset | Size |
| ------------------ | -----------: | ----------: | ---: |
| view               |            0 |           0 |   64 |
| projection         |           16 |          64 |   64 |
| view-projection    |           32 |         128 |   64 |
| camera xyz + time  |           48 |         192 |   16 |
| viewport/count/DPR |           52 |         208 |   16 |

## Draw topology

One render pass contains two direct draws: a three-vertex procedural background and one `drawIndexed(36, instanceCount)` swarm draw. The CPU-selected instance count is intentionally fixed and known; culling, compaction, and indirect arguments begin in later phases.
