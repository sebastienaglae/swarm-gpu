# GPU simulation architecture

Phase 03 moves all steady-state per-instance motion to one compute dispatch. The CPU updates a 320-byte global uniform, encodes compute before render in the same command encoder, and selects one of two persistent resource sets by parity.

## State ownership

| Resource          | Copies | Element     | Bytes/instance | Access                          |
| ----------------- | -----: | ----------- | -------------: | ------------------------------- |
| position + scale  |      2 | `vec4<f32>` |             32 | compute read/write, vertex read |
| velocity + phase  |      2 | `vec4<f32>` |             32 | compute read/write, vertex read |
| appearance + seed |      1 | `vec4<u32>` |             16 | compute/vertex read             |

Phase 03 therefore owns 80 bytes per capacity instance: 40,000,000 bytes at 500k and 80,000,000 bytes at one million, excluding depth and fixed geometry/uniform overhead. Both state copies and all four parity bind groups are created before animation.

```text
frame even: compute A -> B; render B
frame odd:  compute B -> A; render A
```

Source and destination bindings are distinct within every compute bind group. Reset uploads the retained deterministic initial position/velocity arrays into both copies and restores parity zero; pipelines and bind groups are not rebuilt.

## Integration model

Each guarded invocation performs forward Euler integration with:

- bounded hash-derived curl-like acceleration;
- soft central containment outside radius 58;
- optional pointer attraction or repulsion with quadratic falloff;
- acceleration capped at 18 units/s² and speed capped at 10 units/s;
- interactive delta capped at 1/30 s, or fixed 1/60 s in benchmark mode.

No normalization occurs for a vector whose squared length is near zero. Heading is derived from horizontal velocity in the vertex shader, falling back to the deterministic initial heading at negligible speed.

WGSL has no portable `isFinite` builtin. Recovery therefore combines NaN self-equality checks with a conservative magnitude bound (`abs(component) < 1e12`). Invalid state is reconstructed from the immutable per-instance seed without atomics or CPU intervention.

## Pointer projection

The pointer is projected onto the plane through the world origin whose normal is the camera forward vector. The CPU computes only this single frame-level world point from the orbit camera basis. Its position, signed strength, and radius travel in the global uniform. Pointer leave, lost capture, disabled mode, and inactive canvas state force strength to zero.

## Explicit diagnostics

Interactive frames perform no mapping or readback. Development-only methods require the application to be paused:

- state capture copies at most 64 requested fixtures to MAP_READ buffers;
- CPU/WGSL comparison resets, executes one fixed step, and compares deterministic fixtures;
- GPU timing writes four timestamps, resolves them, and maps them after the timed frame.

These explicit paths are used by scripts and never called by the render loop.
