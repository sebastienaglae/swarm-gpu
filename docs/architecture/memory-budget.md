# Initial GPU memory budget

This worksheet estimates explicit SwarmGPU allocations before runtime adapter-limit validation exists. It is a planning bound, not a claim about browser or driver allocation behavior.

## Canonical per-instance storage

| Resource                   |         Copies/regions | Bytes per element | Bytes per active instance |
| -------------------------- | ---------------------: | ----------------: | ------------------------: |
| Position + scale/radius    |    2 ping-pong buffers |                16 |                        32 |
| Velocity + phase/seed      |    2 ping-pong buffers |                16 |                        32 |
| Immutable appearance       |               1 buffer |                16 |                        16 |
| Visible IDs                | 3 LOD capacity regions |                 4 |                        12 |
| **Total variable storage** |                        |                   |                    **92** |

The three visible-ID regions each reserve the full selected instance capacity. This intentionally simple worst-case layout cannot overflow when all visible instances select the same LOD. Future compaction schemes may reduce it only with correctness and benchmark evidence.

## Population estimates

| Population |   Position |   Velocity | Appearance | Visible IDs | Total bytes | Total MiB |
| ---------: | ---------: | ---------: | ---------: | ----------: | ----------: | --------: |
|     10,000 |    320,000 |    320,000 |    160,000 |     120,000 |     920,000 |      0.88 |
|    100,000 |  3,200,000 |  3,200,000 |  1,600,000 |   1,200,000 |   9,200,000 |      8.77 |
|    250,000 |  8,000,000 |  8,000,000 |  4,000,000 |   3,000,000 |  23,000,000 |     21.93 |
|    500,000 | 16,000,000 | 16,000,000 |  8,000,000 |   6,000,000 |  46,000,000 |     43.87 |
|  1,000,000 | 32,000,000 | 32,000,000 | 16,000,000 |  12,000,000 |  92,000,000 |     87.74 |

MiB uses 1,048,576 bytes. Position and velocity columns already include both ping-pong copies.

## Fixed and resolution-dependent estimates

At 1920×1080:

- A `depth24plus`-class attachment is budgeted conservatively as 4 bytes/pixel: 8,294,400 bytes (7.91 MiB).
- If dynamic resolution requires an owned 4-byte color target, add another 7.91 MiB at full scale.
- Mesh vertex/index buffers, uniforms, counters, three indirect records, query sets, and staging/readback rings receive an initial combined planning allowance of 8 MiB until concrete layouts exist.
- Browser swap-chain textures, driver copies, pipeline code, and implementation-internal memory are not measurable through these explicit allocations and are not included.

The conservative explicit allocation estimate for one million instances with depth, one owned color target, and the 8 MiB fixed allowance is approximately 111.6 MiB.

## Initial policy

- Use 256 MiB as the project-controlled explicit allocation ceiling on the reference 4 GiB discrete GPU. This is a safety policy, not an inference that WebGPU exposes all VRAM.
- Reserve 32 MiB of that ceiling before deriving instance capacity. The reserve covers depth/color attachments, mesh/uniform/counter/query resources, three 20-byte indexed indirect records, and alignment headroom. The initial variable-state capacity is therefore `floor((256 MiB - 32 MiB) / 92)` = 2,553,054 instances before adapter-specific limits are applied.
- Never select a population using VRAM alone. Phase 01 must validate each buffer against `maxStorageBufferBindingSize`, total buffer size limits, maximum storage buffers per shader stage, dispatch limits, and successful allocation.
- Compute the highest safe preset before allocation. Disable unsupported presets with the limiting reason.
- Default to at most 100,000 instances until Phase 06 validates a higher stable default on the actual adapter/browser path.
- Treat allocation failure or device loss as a recoverable initialization/runtime state, not permission to retry larger allocations.
- Report estimated explicit bytes in diagnostics; label the value as an estimate rather than GPU memory usage.

## Recalculation rules

Update this worksheet and ADR 0002 when element strides, ping-pong ownership, LOD capacity, render targets, timing rings, or mesh formats change. A population cap change must include the updated arithmetic and runtime limit capture.

## Phase 03 realized allocation

Simulation allocates the two position copies, two velocity copies, and one appearance buffer: 80 bytes per selected capacity instance. Visible-ID storage remains planned for Phase 04 and is not yet allocated. Consequently the renderer reports 76.3 MiB of state at the one-million capacity and 38.1 MiB for 500k; depth and small fixed resources are reported separately by benchmark estimates.

The application shows this planned state allocation alongside adapter capacity before creating the simulation buffers. Runtime allocation is capped at one million even when the Phase 01 planning formula reports a higher future capacity.

## Phase 04 realized allocation

The single-list culling implementation adds one 4-byte visible ID per capacity instance, a 16-byte
counter/capacity block, and one 20-byte indexed indirect record. Realized variable storage is
therefore 84 bytes per instance rather than the 92-byte three-LOD planning bound. At one million
capacity the renderer allocates 84,000,036 bytes (80.1 MiB) of tracked state. Phase 05 may move to
the planned three-list layout and must update both this figure and runtime diagnostics.

## Phase 05 realized allocation

The planned three-list layout is now realized: 12 visible-ID bytes per capacity instance, three
16-byte counter records, and three 20-byte indirect records. Total tracked state is therefore
`capacity × 92 + 108` bytes, or 92,000,108 bytes (87.74 MiB) at one million capacity. The three
lists deliberately reserve full capacity independently to make every classification distribution
overflow-safe without CPU intervention.
