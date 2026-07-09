# Web Production Build Guard

The `web-app` Docker image requires `VITE_API_BASE_URL` at build time.

Build the Render production image with:

```powershell
docker build --build-arg VITE_API_BASE_URL=https://four-wall-api.onrender.com -t paul953206/4wall-web:prod -f web-app/Dockerfile web-app
```

The Dockerfile intentionally fails when the argument is absent. This prevents
shipping a browser bundle that calls `http://localhost:8000` in production.
