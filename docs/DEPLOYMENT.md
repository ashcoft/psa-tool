# Deployment

Power System Analysis Tool (PSA) is a static Next.js application. It can run locally, as a container, on GitHub Pages or on
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
docker build -t psa-tool .
docker run --rm -p 3000:3000 psa-tool
```

Or with Compose:

```bash
docker compose up -d
```

The Compose service includes a health check against `http://127.0.0.1:3000/`.

## GitHub Container Registry (GHCR)

Every push to `main`, every `v*` tag and manual dispatch publishes an image with
`.github/workflows/docker-publish.yml`. The release workflow also publishes the version-tagged
image after semantic-release, because tags created with `GITHUB_TOKEN` do not trigger a downstream
push workflow.

```bash
docker pull ghcr.io/ashcoft/psa-tool:latest
docker run --rm -p 3000:3000 ghcr.io/ashcoft/psa-tool:latest
```

Tags produced by the workflow:

| Tag | When |
|-----|------|
| `latest` | Default branch or a new release |
| `main` | Branch push |
| `1.3.0`, `1.3` | Release workflow, or a manual `v1.3.0` tag |
| `sha-<short>` | Every main/tag build |

The workflows use `GITHUB_TOKEN` with `packages: write`. No extra secret is required. The first
publish creates the package; make it public in the repository package settings if anonymous pulls
are required. `docker/metadata-action` runs with `latest=false`, so an older version tag cannot move
`latest` backwards.

## GitHub Pages

The workbench is live at **https://ashcoft.github.io/psa-tool/**.

The repository includes `.github/workflows/pages.yml`, which builds the static export and deploys
it with the official Pages artifact and deployment actions.

The site always matches the latest release. After semantic-release publishes a release, the release
workflow dispatches the Pages workflow with the release commit SHA, so the deployed `package.json`
version and the app match the tag. Releases created with `GITHUB_TOKEN` do not trigger workflows on
their own, which is why the release workflow dispatches the deployment explicitly.

- Pushes to `main` do not deploy on their own; merge and let the release workflow publish.
- To redeploy manually, run **Actions → Deploy to GitHub Pages → Run workflow** and set `ref` to a
  tag such as `v1.6.0` (or a commit SHA).

- URL: `https://ashcoft.github.io/psa-tool/`
- Source: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
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
| `NEXT_PUBLIC_BASE_PATH` | build | Sub-path for GitHub Pages, for example `/psa-tool` |
| `NEXT_TELEMETRY_DISABLED` | runtime | Disable Next.js telemetry |
| `PORT` | runtime | Container port, default `3000` |
| `BASE_URL` | Playwright | Target URL for end-to-end tests |

## Release flow

1. Merge to `main` with a Conventional Commit message.
2. `semantic-release` updates `CHANGELOG.md` and creates a version tag.
3. The Docker workflow publishes the image for the new tag.
4. The Pages workflow rebuilds the static site from `main`.
5. Vercel deploys if credentials are configured.
