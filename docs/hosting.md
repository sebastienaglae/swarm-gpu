# Hosting and rollback

The canonical host is GitHub Pages at `https://sebastienaglae.github.io/swarm-gpu/`. It provides the
secure context required by WebGPU and serves only static files. There is no custom domain, backend,
secret, analytics integration, service worker, or user data collection.

`.github/workflows/pages.yml` builds with the `/swarm-gpu/` base path. Vite emits content-hashed JS
and CSS filenames; `index.html` and the fallback remain mutable entry points. Pull requests receive a
seven-day downloadable `dist/` preview artifact without deployment permissions. Pushes to `main` and
manual dispatches upload the Pages artifact and deploy through the protected `github-pages`
environment. Repository settings must select **GitHub Actions** as the Pages source once.

## Ownership and rollback

The repository owner controls Pages settings and the `github-pages` environment. GitHub retains the
deployment history. To roll back, dispatch the Pages workflow from the desired commit or revert the
regression on `main` and deploy again. Release workflow artifacts also retain the exact static bundle
for each tag. No DNS or custom-domain rollback exists because v1.0 uses the default GitHub domain.

## Verification

Before deployment, `npm run smoke:production` exercises the built `/swarm-gpu/` path in real Chrome,
checks content-hashed asset URLs, reaches the first WebGPU frame, and verifies the unsupported-device
screen. After deployment, repeat the same supported/unsupported checks against the canonical HTTPS
URL with `npm run smoke:hosted` and record the workflow/release link in the Phase 08 evidence.
