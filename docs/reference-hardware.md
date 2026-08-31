# Reference development environment

Recorded on 2026-08-30 and qualified through Phase 07. This profile identifies the machine used for
primary local WebGPU benchmarks and reliability stress.

## Host

| Field            | Value                                                              | Source/status         |
| ---------------- | ------------------------------------------------------------------ | --------------------- |
| System           | HP Pavilion Gaming Laptop 15-ec1xxx                                | Windows CIM inventory |
| Operating system | Microsoft Windows 11 Home, 64-bit, version 10.0.26200, build 26200 | Windows CIM inventory |
| CPU              | AMD Ryzen 5 4600H with Radeon Graphics                             | Windows CIM inventory |
| CPU topology     | 6 cores / 12 logical processors                                    | Windows CIM inventory |
| Physical memory  | 20,792,307,712 bytes (approximately 19.36 GiB)                     | Windows CIM inventory |

## Graphics adapters

| Role                  | Adapter                        | Driver          |            Reported dedicated/adapter memory | Status                                          |
| --------------------- | ------------------------------ | --------------- | -------------------------------------------: | ----------------------------------------------- |
| Intended reference    | NVIDIA GeForce GTX 1650        | 32.0.16.1088    | 4,293,918,720 bytes (approximately 4.00 GiB) | Identified by Windows; WebGPU selection pending |
| Integrated comparison | AMD Radeon(TM) Graphics        | 31.0.21925.1001 |                   536,870,912 bytes reported | Optional low-power comparison                   |
| Excluded              | Parsec Virtual Display Adapter | 0.45.0.0        |                                 Not reported | Must not be used for performance claims         |

The application will request `high-performance` for reference benchmark scenarios, but the actual adapter returned by the browser must be recorded rather than assumed.

## Baseline browser

| Role                              | Browser        | Installed version at capture | Policy                                                             |
| --------------------------------- | -------------- | ---------------------------- | ------------------------------------------------------------------ |
| Primary development baseline      | Google Chrome  | 151.0.7922.174               | Use stable installed version; record exact version in every result |
| Secondary compatibility candidate | Microsoft Edge | 152.0.4191.53                | Smoke/compatibility comparison when Phase 01 exists                |

Browser versions change. These values identify the Phase 00 environment only and must not be copied into later reports automatically.

## Runtime WebGPU capture

The Phase 01 [reference capability capture](evidence/phase-01/reference-capabilities.json) records a successful 1920×1080 clear-pass run in installed Chrome without experimental WebGPU flags. Chrome exposed vendor `nvidia`, architecture `turing`, optional features including `timestamp-query`, and the relevant buffer/compute/texture limits. It withheld device and description strings, so adapter identity remains correlated with the Windows inventory rather than falsely presented as a complete browser-provided identity.

The following checks are now implemented and captured:

- High-performance adapter acquisition and device creation.
- Adapter information actually exposed by the browser.
- Supported WebGPU features, including `timestamp-query`.
- Relevant buffer, storage-binding, compute-dispatch/workgroup, texture, and alignment limits.
- Safe derived capacity for every planned preset from 10k through 1m.

Browser backend and driver description remain unavailable through the captured WebGPU surface and
must never be invented. Phase 06 performance reports and the Phase 07 full stress matrix now satisfy
their committed contracts on the browser-exposed `nvidia turing` adapter.

## Reference conditions

- Connect AC power and use the OS high-performance mode for reference benchmark claims.
- Close unrelated GPU-intensive applications and disclose remote-display use.
- Run at the scenario's fixed physical canvas resolution; desktop resolution is not a substitute.
- Allow a warm-up period and record thermal/power anomalies.
- Do not merge GTX 1650 and integrated Radeon results into one baseline.
