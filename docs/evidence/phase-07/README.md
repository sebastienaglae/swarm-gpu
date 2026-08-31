# Phase 07 evidence

Full qualification ran on commit `c6030da` using the reference NVIDIA Turing adapter, Chrome 151
headless, Windows 10.0.26200, AC-powered host. After the audit fixed population restoration, the
25-cycle recovery case was repeated on `a261d3f` with an assertion after every recovery. All eleven
scenarios passed; reports are committed under `benchmarks/results/phase-07/` and checked by
`npm run stress:reports`.

| Scenario                |          Contract | Result | Timing drift | Resource evidence                                              |
| ----------------------- | ----------------: | ------ | -----------: | -------------------------------------------------------------- |
| 10k soak                |            10 min | passed |        1.00× | 12 → 12 active                                                 |
| 100k soak               |            10 min | passed |        1.00× | 12 → 12 active                                                 |
| 500k soak               |            10 min | passed |        1.00× | 12 → 12 active                                                 |
| 1m soak                 |             2 min | passed |        1.00× | 12 → 12 active                                                 |
| Resize storm            |     1,000 changes | passed |        1.00× | 12 → 12 active; connected drawable restored                    |
| Pause/resume            |        500 cycles | passed |          n/a | peak one loop; bounded delta                                   |
| LOD/quality             |       500 changes | passed |        1.00× | no tracked resource churn                                      |
| Scene rebuild           |        100 cycles | passed |          n/a | 1,200 created / 1,200 destroyed; 12 → 12 active                |
| Tab hide/show injection |        100 cycles | passed |          n/a | peak one loop; bounded delta                                   |
| Recovery injection      |         25 cycles | passed |     excluded | 300 created / 300 destroyed; 25 expected loss events           |
| Capacity boundaries     | min/max/max+1/NaN | passed |          n/a | safe values accepted; unsafe values rejected before allocation |

All ordinary scenarios recorded zero validation events. Recovery recorded exactly 25 expected
`device-loss` events and no uncaptured validation error. Every scenario reported peak animation-loop
ownership of one and maximum tracked state of 92,000,108 bytes at the renderer's one-million
capacity.

## Additional checks

- Unit tests cover safe arithmetic, buffer/dispatch/indirect/mesh bounds, finite clamping, lifecycle
  state transitions, resource balance, and parsing of both committed stress suites.
- Browser tests cover unsupported WebGPU, sanitized initialization failure, repeated idempotent
  pause/resume/reset, canvas removal/reinsertion, resize, scene rebuild, injected device loss,
  bounded retry, explicit retry, and dispose/reload.
- Existing paused shader fixtures verify simulation CPU/GPU agreement, visibility/indirect records,
  LOD uniqueness/ranges, and deterministic NaN recovery.
- Existing deterministic Phase 05 captures remain the visual reference; Phase 07 changes no shader
  appearance contract.

Physical device loss cannot be forced deterministically from WebGPU, so recovery qualification uses
`device.destroy()` injection and does not promise recovery from every browser/driver failure. A
second GPU/driver qualification remains a Phase 08 release task if that hardware becomes available.
