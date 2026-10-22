import assert from 'node:assert/strict'
import http from 'node:http'

// Run against the production nginx image published on a local port, for example:
// node scripts/verify-platform-routing.mjs http://127.0.0.1:18080
const baseUrl = new URL(process.argv[2] ?? 'http://127.0.0.1:18080')
assert.equal(baseUrl.protocol, 'http:', 'Use the local container HTTP endpoint')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname), 'Use a loopback address')

function request(host, path) {
  return new Promise((resolve, reject) => {
    const req = http.get(new URL(path, baseUrl), { headers: { Host: host } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.setTimeout(10_000, () => req.destroy(new Error(`Timed out: ${host}${path}`)))
    req.on('error', reject)
  })
}

const platformHost = 'platform.4wall.io'
const legacyHosts = ['4wall.io', 'www.4wall.io', 'four-wall-web.onrender.com']
const appPaths = [
  '/invite?token=a%2Fb%2Bc&lang=zh%20TW',
  '/line/link',
  '/m/floorplan/site-a?layout=first',
  '/overview', '/sites/site-a', '/cameras', '/factory-twin', '/demo-factory',
  '/system-status', '/site-map', '/missions/mission-a', '/incidents/incident-a',
  '/attribution', '/industrial-data-engine', '/billing', '/control-plane/routes',
  '/live-ops', '/organizations', '/support', '/audit', '/index.html?entry=direct',
  '/future-workspace/a%20b?token=a%2Fb%2Bc&lang=zh%20TW',
]
let checks = 0
const appShell = await request(platformHost, '/index.html')
assert.equal(appShell.status, 200)

for (const host of [...legacyHosts, platformHost]) {
  for (const query of ['', '?expired=1', '?lineLink=1&returnTo=a%2Fb%2Bc']) {
    const response = await request(host, `/login${query}`)
    assert.equal(response.status, 302, `${host}/login${query}`)
    assert.equal(response.headers.location, `https://${platformHost}/${query}`)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.match(response.headers['x-robots-tag'] ?? '', /noindex/)
    checks += 1
  }
}

for (const host of legacyHosts) {
  const root = await request(host, '/')
  assert.equal(root.status, 301, `${host}/ stays on the official site`)
  assert.equal(root.headers.location, '/official')
  checks += 1

  for (const path of appPaths) {
    const response = await request(host, path)
    assert.equal(response.status, 302, `${host}${path}`)
    assert.equal(response.headers.location, `https://${platformHost}${path}`, `${host}${path}`)
    assert.equal(response.headers['cache-control'], 'no-store', `${host}${path}`)
    assert.match(response.headers['x-robots-tag'] ?? '', /noindex/, `${host}${path}`)
    checks += 1
  }
}

for (const path of ['/', ...appPaths]) {
  const response = await request(platformHost, path)
  assert.equal(response.status, 200, `${platformHost}${path}`)
  assert.equal(response.headers.location, undefined)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.match(response.headers['x-robots-tag'] ?? '', /noindex/)
  assert.equal(response.body, appShell.body, 'Every platform route receives the same app shell')
  checks += 1
}

for (const host of [...legacyHosts, platformHost]) {
  for (const path of ['/official', '/official/', '/official/en', '/official/en/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/official.md', '/healthz']) {
    const response = await request(host, path)
    assert.equal(response.status, 200, `${host}${path}`)
    assert.equal(response.headers.location, undefined, `${host}${path}`)
    if (path.startsWith('/official') && !path.endsWith('.md')) {
      assert.match(response.body, /href="https:\/\/platform\.4wall\.io"/, 'Prerendered login links use the new origin')
    }
    checks += 1
  }
  const missingAsset = await request(host, '/official-assets/domain-check-missing.webp')
  assert.equal(missingAsset.status, 404, 'Missing public assets must not redirect to the platform')
  checks += 1
}

const official = await request('4wall.io', '/official')
const assetPaths = [...new Set(official.body.match(/\/(?:assets|official-assets)\/[^"'<>\s]+/g) ?? [])]
assert.ok(assetPaths.some((path) => path.startsWith('/assets/')), 'Built app assets must be present')
assert.ok(assetPaths.some((path) => path.startsWith('/official-assets/')), 'Official assets must be present')
for (const path of assetPaths) {
  const response = await request('4wall.io', path)
  assert.equal(response.status, 200, `Public asset stays available: ${path}`)
  assert.equal(response.headers.location, undefined)
  checks += 1
}

for (const host of ['localhost', 'four-wall-web-staging.onrender.com']) {
  const root = await request(host, '/')
  assert.equal(root.status, 301, `${host} keeps its existing root behavior`)
  assert.equal(root.headers.location, '/official')
  const login = await request(host, '/login?local-check=1')
  assert.equal(login.status, 200, `${host} is not a production migration alias`)
  assert.equal(login.headers.location, undefined)
  checks += 2
}

console.log(`Passed ${checks} real nginx routing checks.`)
