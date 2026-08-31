# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-31

### Added

- Raw WebGPU simulation for up to one million GPU-resident instances.
- GPU frustum culling, capacity-safe three-LOD compaction, and indirect indexed rendering.
- Asynchronous delayed timestamp/counter telemetry without interactive frame readback.
- Quantized dynamic resolution, deterministic benchmarks, diagnostics export, and allocation audit.
- Bounded device-loss recovery, lifecycle/resource counters, defensive validation, and complete
  hardware stress qualification.
- GitHub Pages packaging, production smoke, release audits, public documentation, and deterministic
  release media.

### Verified

- 250,000 simulated instances at 16.9 ms display p95 and 2.621 ms median GPU time on the named
  reference environment.
- Four hardware soaks totaling 32 minutes plus resize, lifecycle, LOD, rebuild, visibility, recovery,
  and capacity-boundary stress scenarios.

[1.0.0]: https://github.com/sebastienaglae/swarm-gpu/releases/tag/v1.0.0
