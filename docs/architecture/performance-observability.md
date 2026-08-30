# Performance observability architecture

Phase 06 keeps measurement out of the critical dependency chain. Each frame records display cadence,
CPU update, command encoding, and `queue.submit()` duration into fixed 512-sample rings. When
`timestamp-query` is available, simulation, classification, and render passes write six timestamps
into one of three persistent telemetry slots. Resolve and copy happen every 60 frames; mapping is
asynchronous and only completed, delayed slots are consumed. The interactive frame never awaits a
GPU result.

```text
rAF -> update -> encode passes -> submit
          |          |              |
          + fixed numeric CPU rings +
                     |
GPU timestamps -> resolve/copy slot -> delayed map -> fixed GPU ring
GPU counters   -> copy same slot ---^              -> diagnostics/export
```

Unsupported timestamp queries are reported as unavailable. CPU submit duration is not presented as
GPU duration. Visible and per-LOD counts are explicitly marked delayed. Summary percentiles are
calculated at the diagnostics cadence (4 Hz), not in every render iteration.

Dynamic resolution selects one of `0.5, 0.625, 0.75, 0.875, 1.0`. It evaluates 90-frame windows,
requires two slow windows to step down and three fast windows to step up, and prefers delayed GPU
time over frame cadence. Only the internal canvas changes; CSS display size remains stable. It is
disabled in deterministic benchmarks unless a scenario requests `auto`.

## Ownership and lifetime

- Pipelines, bind groups, simulation/visible/indirect buffers, pass descriptors, depth texture, and
  telemetry buffers persist across frames.
- Resize recreates only size-dependent attachments after the quantized scale or display size changes.
- Device teardown destroys renderer-owned buffers and textures and stops pending telemetry use.
- Diagnostics export contains capability flags, scenario state, warnings, raw bounded samples, latest
  delayed counters, and the tracked memory estimate.
