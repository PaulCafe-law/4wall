import { expect, test } from '@playwright/test'

const viewerSession = {
  accessToken: 'viewer-token',
  tokenType: 'bearer',
  expiresInSeconds: 900,
  user: {
    userId: 'viewer-1',
    email: 'viewer@test.dev',
    displayName: 'Viewer User',
    globalRoles: [],
    memberships: [
      {
        membershipId: 'membership-1',
        organizationId: 'org-1',
        role: 'customer_viewer',
        isActive: true,
      },
    ],
  },
}

test('customer viewer can browse but cannot see site mutation controls', async ({ page }) => {
  await page.route('**/v1/web/session/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'missing_refresh_cookie' }),
    })
  })

  await page.route('**/v1/web/session/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(viewerSession),
    })
  })

  await page.route('**/v1/missions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  await page.route('**/v1/sites', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          siteId: 'site-1',
          organizationId: 'org-1',
          name: 'Viewer Site',
          externalRef: null,
          address: 'Taipei',
          location: { lat: 25.03391, lng: 121.56452 },
          notes: '',
          siteMap: {
            siteId: 'site-1',
            baseMapType: 'satellite',
            center: { lat: 25.03391, lng: 121.56452 },
            zoom: 18,
            zones: [],
            launchPoints: [],
            viewpoints: [],
            updatedAt: '2026-04-10T00:00:00Z',
          },
          activeRouteCount: 0,
          activeTemplateCount: 0,
          activeRoutes: [],
          activeTemplates: [],
          createdAt: '2026-04-10T00:00:00Z',
          updatedAt: '2026-04-10T00:00:00Z',
        },
      ]),
    })
  })

  await page.goto('/login')
  await page.locator('form input[type="email"]').fill('viewer@test.dev')
  await page.locator('form input[type="password"]').fill('Password123!')
  await page.locator('form button[type="submit"]').click()

  const sidebar = page.locator('aside').first()
  await expect(sidebar).toBeVisible()
  await sidebar.locator('a[href="/sites"]').first().click()

  await expect(page.locator('main').getByRole('link', { name: /Viewer Site/i })).toBeVisible()
  await expect(page.locator('main').getByRole('button')).toHaveCount(0)
})
