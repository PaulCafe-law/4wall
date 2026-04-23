# Auth

## Model

The beta backend uses local operator accounts with JWT access and refresh tokens.

- access token: short-lived bearer token for API calls
- refresh token: stored and rotated server-side
- artifact endpoints: authenticated, not signed

## Endpoints

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`
- `POST /v1/internal/operators` for platform-admin operator provisioning

## Token Behavior

- access token TTL defaults to 15 minutes
- refresh token TTL defaults to 7 days
- refresh rotation revokes the previous refresh token record
- inactive operators are rejected even with a structurally valid token
- Android prod mode restores the last local session when available and attempts refresh before authenticated requests
- auth expiry blocks new server-dependent operations, but must not interrupt already safe local flight execution

## Bootstrap Operator

Development can seed a bootstrap operator from environment variables:

- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_ENABLED`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_USERNAME`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_PASSWORD`
- `BUILDING_ROUTE_BOOTSTRAP_OPERATOR_DISPLAY_NAME`

This is for local/dev only. Production beta should disable it and provision operators out of band.

## Operator Provisioning

Staging and production keep bootstrap operator seeding disabled. A `platform_admin`
web user can provision Android operator accounts through `POST /v1/internal/operators`.

The endpoint is intentionally internal-only:

- requires a valid web bearer token
- requires the `platform_admin` global role
- writes an audit event
- never stores plaintext passwords
- only updates an existing operator password when `updatePassword` is explicitly true

## Security Notes

- change `BUILDING_ROUTE_AUTH_SECRET_KEY` before any shared or deployed environment
- use a key at least 32 bytes long
- artifact access is intentionally protected by bearer auth in beta, which keeps Android download logic simple
