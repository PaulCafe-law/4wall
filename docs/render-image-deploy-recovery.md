# Render Image Deploy Recovery

## Problem

Render Git-backed deploys can fail even when the repository is public if the
Render Git provider connection is blocked by the GitHub account or app
installation state. In that condition, manual deploys fail before application
code is built.

Observed failure class:

- Render reports that it cannot access `https://github.com/PaulCafe-law/4wall`.
- Local anonymous `git ls-remote https://github.com/PaulCafe-law/4wall HEAD`
  can still read `main`.
- Existing live Render instances may remain healthy, but new Git deploys fail.

This is a deploy-source problem, not an application runtime problem.

## Recovery Decision

Use image-based Render services backed by Docker Hub until the GitHub provider
connection is repaired.

For the current account state, Docker Hub is preferred over GHCR because:

- Docker Hub does not depend on the GitHub Marketplace app or GitHub Actions.
- Images can be built and pushed from a local machine.
- Render can pull public Docker Hub images as an Existing Image source.

GHCR remains a good long-term registry after GitHub Actions and package scopes
are available again.

## Service Shape

API services can move directly to Existing Image:

- `four-wall-api-staging`
- `four-wall-api`

Web services must be rebuilt as image-backed Render Web Services because Render
Static Sites cannot deploy from Docker images:

- `four-wall-web-staging`
- `four-wall-web`

The web image serves the Vite build with nginx and includes SPA fallback for
browser routes.

## Image Contract

Build separate web images for staging and production because Vite reads
`VITE_API_BASE_URL` at build time. The browser Google Maps key is injected at
container startup from the Render runtime env var `VITE_GOOGLE_MAPS_API_KEY`
into `/runtime-config.js`.

Example image names:

```text
docker.io/<dockerhub-namespace>/4wall-api:staging
docker.io/<dockerhub-namespace>/4wall-api:prod
docker.io/<dockerhub-namespace>/4wall-web:staging
docker.io/<dockerhub-namespace>/4wall-web:prod
```

Recommended immutable tags should also include the git SHA:

```text
docker.io/<dockerhub-namespace>/4wall-api:<sha>
docker.io/<dockerhub-namespace>/4wall-web:<sha>-staging
docker.io/<dockerhub-namespace>/4wall-web:<sha>-prod
```

## Local Build Commands

API:

```sh
docker build -t docker.io/<dockerhub-namespace>/4wall-api:<sha> planner-server
docker tag docker.io/<dockerhub-namespace>/4wall-api:<sha> docker.io/<dockerhub-namespace>/4wall-api:staging
docker push docker.io/<dockerhub-namespace>/4wall-api:<sha>
docker push docker.io/<dockerhub-namespace>/4wall-api:staging
```

Web staging:

```sh
docker build \
  --build-arg VITE_API_BASE_URL=https://four-wall-api-staging.onrender.com \
  --build-arg VITE_APP_ENVIRONMENT=staging \
  -t docker.io/<dockerhub-namespace>/4wall-web:<sha>-staging \
  web-app
docker tag docker.io/<dockerhub-namespace>/4wall-web:<sha>-staging docker.io/<dockerhub-namespace>/4wall-web:staging
docker push docker.io/<dockerhub-namespace>/4wall-web:<sha>-staging
docker push docker.io/<dockerhub-namespace>/4wall-web:staging
```

Web production:

```sh
docker build \
  --build-arg VITE_API_BASE_URL=https://four-wall-api.onrender.com \
  --build-arg VITE_APP_ENVIRONMENT=production \
  -t docker.io/<dockerhub-namespace>/4wall-web:<sha>-prod \
  web-app
docker tag docker.io/<dockerhub-namespace>/4wall-web:<sha>-prod docker.io/<dockerhub-namespace>/4wall-web:prod
docker push docker.io/<dockerhub-namespace>/4wall-web:<sha>-prod
docker push docker.io/<dockerhub-namespace>/4wall-web:prod
```

## Render Cutover

1. Keep the existing Static Sites live until the image-backed web services pass
   health and smoke checks.
2. Create image-backed Render Web Services for staging and production web.
3. Use the same API origins already configured for CORS:
   - staging web origin: `https://four-wall-web-staging.onrender.com`
   - production web origin: `https://four-wall-web.onrender.com`
4. Set `VITE_GOOGLE_MAPS_API_KEY` on both image-backed web services if Google
   Maps editing is enabled.
5. If preserving the exact Render subdomains is required, only delete or rename
   the old Static Site after the replacement service is verified.
6. Re-run web login and authenticated mission-list smoke checks after cutover.

## Rollback

Rollback is image tag based:

1. Retag the last known-good image as `staging` or `prod`.
2. Push the tag to Docker Hub.
3. Trigger Render deploy latest image.
4. Verify API `/healthz` and web smoke checks.

Do not change Android or flight-critical runtime behavior as part of this
deploy-source recovery.
