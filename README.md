# Verrio web presence

This repository supports the public `verrio.co` holding page and the current map application that will be published separately at `maps.verrio.co`.

## Structure

- `/` is the holding page for `verrio.co`
- `/docs/` is the current GitHub-hosted map application
- `/maps/almond-fields/` is a lightweight reference polygon viewer

## Cloudflare Pages setup

Create two Pages projects from the same repository:

1. `verrio-site`
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: leave blank
   - Build output directory: `/`
   - Custom domain: `verrio.co`

2. `verrio-maps`
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: leave blank
   - Build output directory: `docs`
   - Custom domain: `maps.verrio.co`

## Publishing flow

1. Make changes in Codex.
2. Commit to `main`.
3. Push to GitHub.
4. Cloudflare Pages deploys the holding page and map app automatically.
