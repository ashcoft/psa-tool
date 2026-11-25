# Security policy

## Supported versions

Security fixes are applied to the latest release on `main`. Older tags are not maintained.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use the repository's **Security →
Report a vulnerability** flow (GitHub private advisory) or contact the maintainers through the
repository profile.

Include:

- a description of the issue and its impact,
- the version or commit,
- reproduction steps or a minimal project file,
- any suggested fix.

You will receive an acknowledgement as soon as possible. Please allow time for a fix before public
disclosure.

## Security model

Power System Analysis Tool (PSA) is a client-side application:

- Project files are JSON and never leave the browser unless the user downloads them.
- Study results are session-only and are not stored on a server.
- Settings are stored in `localStorage` under `psat-web.settings.v1`.
- Imported project files are validated and normalised before use, but they are untrusted input.
  Treat a project from an unknown source as data, not as code.
- The Docker image runs as a non-root user and serves a static Next.js build.

## Dependencies

Dependency updates are handled by Renovate and reviewed like any other change. The project uses
`npm overrides` for known transitive vulnerabilities. Run `npm audit` before a release and report
any unfixed advisory.
