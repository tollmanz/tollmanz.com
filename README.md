# www.tollmanz.com

Personal website built with [Eleventy (11ty)](https://www.11ty.dev/), deployed to
GitHub Pages and served through Fastly.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production (output in public/)
npm run build
```

## Deployment

The site deploys to GitHub Pages via `.github/workflows/pages.yml`: a build job
runs Eleventy and uploads `public/` as a Pages artifact, then a deploy job
publishes it with `actions/deploy-pages`. It triggers on pushes to `main` and can
be run manually from the Actions tab ("Deploy to GitHub Pages" -> "Run
workflow"). No deployment secrets are required; the workflow authenticates to
Pages with an OIDC token.

Fastly sits in front of GitHub Pages as the CDN and TLS terminator. Its
configuration is managed with Pulumi in [`infra/fastly/`](infra/fastly/).

### One-time GitHub Pages setup

DNS for `tollmanz.com` and `www.tollmanz.com` is managed at Fastly and must
resolve to Fastly, not to GitHub's Pages IPs or a `tollmanz.github.io` CNAME.
Fastly is the only path to the GitHub Pages origin; pointing these records at
GitHub would bypass Fastly entirely.

The rest are repo settings, configured once outside this codebase:

1. Settings -> Pages -> Source: "GitHub Actions"
2. Settings -> Pages -> Custom domain: `www.tollmanz.com` (must match the
   `overrideHost` in `infra/fastly/index.ts`). A `CNAME` file in the build
   output is ignored on the Actions deploy flow, so the domain is set here
   instead.
3. "Enforce HTTPS" stays off and is unavailable: because the DNS above points at
   Fastly rather than GitHub's IPs, GitHub cannot issue a certificate for the
   domain. Visitor TLS is terminated at Fastly.
