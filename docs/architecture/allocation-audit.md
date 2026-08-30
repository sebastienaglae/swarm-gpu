# Steady-state allocation audit

The ordinary render path intentionally creates no application-owned arrays, vectors, matrices,
buffers, bind groups, pipelines, or pass-descriptor objects per frame. Camera and uniform data use
preallocated typed arrays; pass descriptors are mutated in place; sample recorders overwrite fixed
numeric rings.

Known bounded exceptions are outside ordinary hot frames:

| Path                    |         Cadence | Allocation                                    | Reason                      |
| ----------------------- | --------------: | --------------------------------------------- | --------------------------- |
| GPU telemetry           | every 60 frames | promise/callback bookkeeping                  | asynchronous map completion |
| Diagnostics UI          |            4 Hz | formatted strings and percentile scratch data | human-readable overlay      |
| Diagnostics export      |     user action | report object and copied sample arrays        | downloadable evidence       |
| Resize/scale transition |    event-driven | replacement depth attachment                  | size-dependent resource     |

Browser/WebGPU implementation internals are not measurable as JavaScript ownership and are not
claimed as zero. The auditable claim is **zero intentional application allocations on ordinary
steady-state render frames**, with the exceptions above disclosed.
