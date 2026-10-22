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
const officialHosts = ['4wall.io', 'www.4wall.io']
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
  if (officialHosts.includes(host)) {
    assert.equal(root.status, 200, `${host}/ directly serves the official website`)
    assert.equal(root.headers.location, undefined)
    assert.doesNotMatch(root.headers['x-robots-tag'] ?? '', /noindex/)
    assert.match(root.body, /<link rel="canonical" href="https:\/\/www\.4wall\.io\/"/)
    assert.match(root.body, /href="\/en"/, 'Language link uses the new English route')
    assert.match(root.body, /讓機台資料真正用來改善生產/)
  } else {
    assert.equal(root.status, 301, `${host}/ retains its public-site entry`)
    assert.equal(root.headers.location, '/official')
  }
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

for (const path of ['/', '/en', '/en/', ...appPaths]) {
  const response = await request(platformHost, path)
  assert.equal(response.status, 200, `${platformHost}${path}`)
  assert.equal(response.headers.location, undefined)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.match(response.headers['x-robots-tag'] ?? '', /noindex/)
  assert.equal(response.body, appShell.body, 'Every platform route receives the same app shell')
  checks += 1
}

for (const host of [...legacyHosts, platformHost]) {
  for (const path of ['/official', '/official/', '/official/en', '/official/en/']) {
    for (const query of ['', '?ref=a%2Fb%2Bc&lang=zh%20TW']) {
      const response = await request(host, `${path}${query}`)
      const destination = path.startsWith('/official/en') ? '/en' : '/'
      assert.equal(response.status, 301, `${host}${path}${query}`)
      assert.equal(response.headers.location, `https://www.4wall.io${destination}${query}`)
      assert.equal(response.headers['cache-control'], 'no-store')
      checks += 1
    }
  }
  for (const path of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/official.md', '/healthz']) {
    const response = await request(host, path)
    assert.equal(response.status, 200, `${host}${path}`)
    assert.equal(response.headers.location, undefined, `${host}${path}`)
    if (path === '/robots.txt') {
      if (host === platformHost) {
        assert.equal(response.body, 'User-agent: *\nDisallow: /\n')
      } else {
        assert.match(response.body, /Allow: \/\$/)
        assert.match(response.body, /Sitemap: https:\/\/www\.4wall\.io\/sitemap\.xml/)
      }
    }
    checks += 1
  }
  const missingAsset = await request(host, '/official-assets/domain-check-missing.webp')
  assert.equal(missingAsset.status, 404, 'Missing public assets must not redirect to the platform')
  checks += 1
}

for (const host of officialHosts) {
  const english = await request(host, '/en?campaign=language-check')
  assert.equal(english.status, 200)
  assert.equal(english.headers.location, undefined)
  assert.doesNotMatch(english.headers['x-robots-tag'] ?? '', /noindex/)
  assert.match(english.body, /<html lang="en"/)
  assert.match(english.body, /<link rel="canonical" href="https:\/\/www\.4wall\.io\/en"/)
  assert.match(english.body, /href="\/"/, 'Language link returns to the official root')
  const englishSlash = await request(host, '/en/?ref=a%2Fb')
  assert.equal(englishSlash.status, 301)
  assert.equal(englishSlash.headers.location, 'https://www.4wall.io/en?ref=a%2Fb')
  checks += 2
}

const official = await request('www.4wall.io', '/')
assert.match(official.body, /href="https:\/\/platform\.4wall\.io"/, 'Platform link uses its separate origin')
const assetPaths = [...new Set(official.body.match(/\/(?:assets|official-assets)\/[^"'<>\s]+/g) ?? [])]
assert.ok(assetPaths.some((path) => path.startsWith('/assets/')), 'Built app assets must be present')
assert.ok(assetPaths.some((path) => path.startsWith('/official-assets/')), 'Official assets must be present')
for (const path of assetPaths) {
  const response = await request('www.4wall.io', path)
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
  for (const path of ['/official', '/official/en']) {
    const response = await request(host, path)
    assert.equal(response.status, 200, `${host}${path} keeps its public preview route`)
    assert.equal(response.headers.location, undefined)
    checks += 1
  }
  for (const path of ['/en', '/en/']) {
    const response = await request(host, path)
    assert.equal(response.status, 200, `${host}${path} retains the app fallback`)
    assert.equal(response.body, appShell.body)
    assert.match(response.headers['x-robots-tag'] ?? '', /noindex/)
    checks += 1
  }
}

console.log(`Passed ${checks} real nginx routing checks.`)
