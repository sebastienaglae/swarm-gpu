# Architecture overview

SwarmGPU is a single-scene, GPU-driven renderer. The CPU owns lifecycle, input, camera, and one
frame-global uniform upload. It never scans instances after deterministic initialization. The GPU
simulates state, classifies visibility and LOD, compacts visible IDs, writes indirect arguments, and
draws the swarm.

The checked-in [pipeline diagram](../media/pipeline.svg) provides an accessible static overview.
Detailed contracts live in the [simulation](gpu-simulation.md), [culling](gpu-culling.md),
[LOD](gpu-lod.md), [observability](performance-observability.md), and
[reliability](reliability-model.md) documents. Accepted decisions are indexed in the
[ADR directory](decisions/README.md).

## Frame order

1. CPU updates a persistent uniform staging array with camera, timestep, interaction, frustum, LOD,
   and visual parameters, then performs one bounded `queue.writeBuffer`.
2. The simulation compute pass reads ping state A/B and writes the opposite state. Static benchmark
   mode leaves parity unchanged.
3. The classification pass tests active invocations, frustum visibility, projected radius, and three
   full-capacity LOD regions. Atomics append visible instance IDs.
4. A three-invocation finalizer clamps counts and writes three 20-byte indexed indirect records.
5. The render pass draws the procedural background and issues three `drawIndexedIndirect` calls.
6. Every 60 frames, when supported, timestamp and counter results are copied into a three-slot
   asynchronous ring. No interactive frame awaits or maps a GPU buffer.

Pass order inside one command buffer supplies the required WebGPU synchronization. Ping-pong state
prevents read/write aliasing. The CPU does not insert explicit barriers and never reads visibility to
decide a draw.

## Buffer layout

| Resource           | Layout                                |              Copies/regions | Bytes per capacity instance |
| ------------------ | ------------------------------------- | --------------------------: | --------------------------: |
| Position           | `vec4<f32>` position + scale          |                 2 ping-pong |                          32 |
| Velocity           | `vec4<f32>` velocity + phase          |                 2 ping-pong |                          32 |
| Appearance         | `vec4<u32>` packed color/variant/seed |                           1 |                          16 |
| Visible IDs        | `u32` instance IDs                    | 3 full-capacity LOD regions |                          12 |
| **Variable total** | structure-of-arrays                   |                             |                      **92** |

Fixed resources include a 448-byte aligned uniform buffer, combined LOD vertex/index buffers, three
16-byte counter records, three 20-byte indirect records, depth attachment, pipelines/bind groups, and
the optional timestamp ring. At one-million capacity, tracked state is 92,000,108 bytes (87.74 MiB).
The [memory worksheet](memory-budget.md) distinguishes this estimate from browser/driver allocations.

## Resource lifecycle

Pipelines, bind groups, state, counters, visible lists, indirect arguments, descriptors, and sample
rings persist across frames. Resize replaces only the depth texture. Scene rebuild and device-loss
recovery destroy owned resources in reverse order, rebuild from deterministic configuration, retain
safe CPU settings, and restore exactly one animation loop. Development counters and the Phase 07
stress matrix verify balanced ownership.
