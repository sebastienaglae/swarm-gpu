# Phase 08 release evidence

Release-candidate qualification was performed on 2026-08-31. The presentation and media source is
commit `65e5c6209592a77a5e879ca525f8b55d9991ce1f`; the serialized E2E harness fix is commit
`2227a16372767bd203562e3d571fbd40a67ab7b5`. Both precede the local `v1.0.0` tag.

## Media contract

`npm run capture:release` builds the production bundle, opens its `/swarm-gpu/` base path in installed
Chrome, selects deterministic benchmark mode and 500,000 instances, warms for 1.5 seconds, and
captures the overlay plus a clean view. The video is assembled from exactly 100 clean frames at
10 fps, yielding 10.000 seconds at 960×540. The poster and overlay remain 1280×720 for readability.

| Artifact                   | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `performance-overlay.webp` | `656843fa5a69b8c5bd656c303f90bc8c4deb7abb31ef999613451aeff0335427` |
| `pipeline.svg`             | `5420bc947d87663407221bbf1f5c5c7a8a69d5d50c0dae74c4d2fc63e54f179f` |
| `showcase-poster.webp`     | `13f6431f753af16d11460891747cb8427301cdaa1a8c7547a502763e79a8e2db` |
| `swarmgpu-showcase.webm`   | `6bef39151623b3647f7d11d75737f1b203b2b773fae8df7b5f1dff902178c558` |

The animation is presentation evidence, not a timing benchmark. Headline numbers remain sourced
from the Phase 06 reports and their declared reference environment.

## Clean-clone qualification

A local clone made with `git clone --local --no-hardlinks` at commit `2227a16` passed `npm ci` and
`npm run build` using the repository-pinned Node.js 22.20.0 runtime. The build emitted only
`index.html`, `.nojekyll`, `favicon.svg`, and content-hashed CSS/JS; no source maps were emitted.

The host shell's Node.js 22.12.0 was also deliberately rejected by `engine-strict`, confirming that
the documented prerequisite is enforced instead of silently ignored.

## Deployment boundary

The production and unsupported-device paths pass locally through `npm run smoke:production`. At the
time this evidence was written, the canonical Pages URL returned HTTP 404 because repository Pages
had not yet been enabled/deployed. The repository policy for this implementation was **commit, do
not push**; therefore hosted acceptance and GitHub Release publication remain intentionally open.
The Pages and release workflows contain the required deployment, rollback bundle, evidence bundle,
and least-privilege permissions for the owner-triggered push.
