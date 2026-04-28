# Verrio web presence

This repository is intended to back the public `verrio.co` site and any shareable map or analytics prototypes that sit beside it.

## Structure

- `/` is the public landing page for `verrio.co`
- `/docs/` is the Portugal Almond Climate Rank application
- `/maps/almond-fields/` is a lightweight orchard polygon viewer

## Cloudflare Pages settings

- Production branch: `main`
- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`

## Publishing flow

1. Make changes in Codex.
2. Commit to `main`.
3. Push to GitHub.
4. Cloudflare Pages deploys automatically.

## Recommended domain routing

- `verrio.co` -> landing page
- `www.verrio.co` -> redirect to `verrio.co`
- future tools can later move to subdomains such as `maps.verrio.co` if needed
