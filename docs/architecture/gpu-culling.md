# GPU culling and indirect rendering

The normal frame owns visibility entirely on the GPU:

```text
clear counters -> simulate -> sphere/frustum cull -> atomic append
               -> finalize 20-byte indexed indirect record -> drawIndexedIndirect
```

The global uniform block contains the six normalized planes extracted from the same WebGPU
view-projection matrix used for rendering. The conservative test uses the authored drone bound
(`1.5`) multiplied by instance scale and a `1.08` safety margin.

`visibleIds` has one `u32` slot per renderer-capacity instance. An atomic reservation always
increments the visible count, but the shader writes only when the reserved index is below capacity;
additional reservations increment a separate overflow counter. A one-thread finalize pipeline
clamps the indirect instance count to capacity and writes all five indexed-draw fields.

The vertex shader maps `instance_index` through `visibleIds` before reading position, velocity, and
appearance. `?direct=1` compiles a development reference variant that skips culling and calls the
ordinary indexed instanced draw. `?benchmark=1&visibility=10|50|100` activates a deterministic,
synthetic visibility ratio solely for reproducible profiling.

There is no counter or ID readback in the interactive frame loop. The development API exposes an
explicit paused capture that copies counters, indirect arguments, and a bounded ID prefix for CPU
comparison. Timestamp readback likewise occurs only after the interactive measurement window.

At the one-million capacity, explicit renderer state is 84,000,036 bytes: two position buffers,
two velocity buffers, immutable appearance, visible IDs, the 16-byte counter block, and the
20-byte indirect record. All are allocated during renderer creation and persist until teardown.
