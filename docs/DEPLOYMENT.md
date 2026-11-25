# Deployment

PSAT Web is a static Next.js application. It can run locally, as a container, on GitHub Pages or on
Vercel.

## Local

Requirements: Node.js 26 (see `.nvmrc`) and npm.

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build      # production build
npm run start      # production server
```

Quality gates:

```bash
npm run lint
npm run test:run
npm run test:e2e
```

## Docker

The image uses the Next.js standalone output, runs as a non-root user and listens on port 3000.

```bash
docker build -t psat-web .
docker run --rm -p 3000:3000 psat-web
```

Or with Compose:

```bash
docker compose up -d
```

The Compose service includes a health check against `http://127.0.0.1:3000/`.

## GitHub Container Registry (GHCR)

Every push to `main`, every `v*` tag and manual dispatch publishes an image with the workflow in
`.github/workflows/docker-publish.yml`.

```bash
docker pull ghcr.io/ashcoft/psat-web:latest
docker run --rm -p 3000:3000 ghcr.io/ashcoft/psat-web:latest
```

Tags produced by the workflow:

| Tag | When |
|-----|------|
| `latest` | Default branch |
| `main` | Branch push |
| `1.2.0`, `1.2` | Semantic version tag `v1.2.0` |
| `sha-<short>` | Every build |

The workflow uses `GITHUB_TOKEN` with `packages: write`. No extra secret is required. The first
publish creates the package; make it public in the repository package settings if anonymous pulls
are required.

## GitHub Pages

The workbench is live at **https://ashcoft.github.io/psat-web/**.

The current deployment is served from the `gh-pages` branch. The repository also includes
`.github/workflows/pages.yml` to rebuild and deploy it from `main` with the Actions source.

- URL: `https://ashcoft.github.io/psat-web/`
- Actions source: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- Branch source: **Source: Deploy from a branch → `gh-pages` / root**.
- The workflow writes `out/.nojekyll` so the `_next` asset directory is served.
- The static export is configured in `next.config.js` when `NEXT_OUTPUT=export`.

Build the same artifact locally:

```bash
npm run build:pages
```

## Vercel

The optional workflow `.github/workflows/vercel.yml` deploys when these repository secrets exist:

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` | Vercel personal access token |
| `VERCEL_ORG_ID` | Vercel team or user id |
| `VERCEL_PROJECT_ID` | Vercel project id |

Without `VERCEL_TOKEN` the workflow skips the deployment instead of failing.

## Environment variables

| Variable | Used by | Meaning |
|----------|---------|---------|
| `NEXT_OUTPUT` | build | `standalone` for Docker, `export` for GitHub Pages |
| `NEXT_PUBLIC_BASE_PATH` | build | Sub-path for GitHub Pages, for example `/psat-web` |
| `NEXT_TELEMETRY_DISABLED` | runtime | Disable Next.js telemetry |
| `PORT` | runtime | Container port, default `3000` |
| `BASE_URL` | Playwright | Target URL for end-to-end tests |

## Release flow

1. Merge to `main` with a Conventional Commit message.
2. `semantic-release` updates `CHANGELOG.md` and creates a version tag.
3. The Docker workflow publishes the image for the new tag.
4. The Pages workflow rebuilds the static site from `main`.
5. Vercel deploys if credentials are configured.
