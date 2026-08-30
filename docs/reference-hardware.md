# Reference development environment

Recorded on 2026-08-30 for Phase 00. This profile identifies the machine intended for initial development and primary local qualification. It is not yet a verified WebGPU adapter report.

## Host

| Field | Value | Source/status |
|---|---|---|
| System | HP Pavilion Gaming Laptop 15-ec1xxx | Windows CIM inventory |
| Operating system | Microsoft Windows 11 Home, 64-bit, version 10.0.26200, build 26200 | Windows CIM inventory |
| CPU | AMD Ryzen 5 4600H with Radeon Graphics | Windows CIM inventory |
| CPU topology | 6 cores / 12 logical processors | Windows CIM inventory |
| Physical memory | 20,792,307,712 bytes (approximately 19.36 GiB) | Windows CIM inventory |

## Graphics adapters

| Role | Adapter | Driver | Reported dedicated/adapter memory | Status |
|---|---|---|---:|---|
| Intended reference | NVIDIA GeForce GTX 1650 | 32.0.16.1088 | 4,293,918,720 bytes (approximately 4.00 GiB) | Identified by Windows; WebGPU selection pending |
| Integrated comparison | AMD Radeon(TM) Graphics | 31.0.21925.1001 | 536,870,912 bytes reported | Optional low-power comparison |
| Excluded | Parsec Virtual Display Adapter | 0.45.0.0 | Not reported | Must not be used for performance claims |

The application will request `high-performance` for reference benchmark scenarios, but the actual adapter returned by the browser must be recorded rather than assumed.

## Baseline browser

| Role | Browser | Installed version at capture | Policy |
|---|---|---|---|
| Primary development baseline | Google Chrome | 151.0.7922.174 | Use stable installed version; record exact version in every result |
| Secondary compatibility candidate | Microsoft Edge | 152.0.4191.53 | Smoke/compatibility comparison when Phase 01 exists |

Browser versions change. These values identify the Phase 00 environment only and must not be copied into later reports automatically.

## Required runtime WebGPU capture — pending Phase 01

The following fields cannot be proven from operating-system inventory and remain deliberately unresolved:

- Actual `GPUAdapter` selected for each power preference.
- Adapter information exposed by the browser.
- All supported WebGPU features, especially `timestamp-query`.
- Relevant limits including maximum storage-buffer binding size, buffer size, storage buffers per shader stage, compute workgroup dimensions/invocations/storage, dispatch dimensions, texture dimensions, and uniform alignment.
- Browser backend and any driver description exposed by the WebGPU implementation.
- Successful capacity/allocation checks for 10k, 100k, 250k, 500k, and 1m.

Until a clean runtime capability export fills those fields, performance numbers are development observations and cannot be promoted to the README headline.

## Reference conditions

- Connect AC power and use the OS high-performance mode for reference benchmark claims.
- Close unrelated GPU-intensive applications and disclose remote-display use.
- Run at the scenario's fixed physical canvas resolution; desktop resolution is not a substitute.
- Allow a warm-up period and record thermal/power anomalies.
- Do not merge GTX 1650 and integrated Radeon results into one baseline.

