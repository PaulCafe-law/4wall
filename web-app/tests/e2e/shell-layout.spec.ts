import { expect, test } from '@playwright/test'

const adminSession = {
  accessToken: 'admin-token',
  tokenType: 'bearer',
  expiresInSeconds: 900,
  user: {
    userId: 'admin-1',
    email: 'platform@prod.internal.test',
    displayName: 'Production Platform Admin',
    globalRoles: ['platform_admin'],
    memberships: [],
  },
}

const viewports = [
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 960 },
]

for (const viewport of viewports) {
  test(`desktop shell rail stays inside the sidebar at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)

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
        body: JSON.stringify(adminSession),
      })
    })

    await page.route('**/v1/missions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            missionId: 'mission-1',
            organizationId: 'org-1',
            siteId: 'site-1',
            missionName: 'Smoke Mission',
            status: 'ready',
            bundleVersion: '1.0.0',
            createdAt: '2026-04-10T00:00:00Z',
          },
        ]),
      })
    })

    await page.goto('/login')
    await page.locator('form input[type="email"]').fill('platform@prod.internal.test')
    await page.locator('form input[type="password"]').fill('Password123!')
    await page.locator('form button[type="submit"]').click()

    const sidebar = page.locator('aside').first()
    const nav = sidebar.locator('nav').first()
    const main = page.locator('main')

    await expect(sidebar).toBeVisible()
    await expect(nav).toBeVisible()
    await expect(sidebar.locator('a[href="/audit"]').first()).toBeVisible()

    const [sidebarBox, navBox, mainBox] = await Promise.all([
      sidebar.boundingBox(),
      nav.boundingBox(),
      main.boundingBox(),
    ])

    expect(sidebarBox).not.toBeNull()
    expect(navBox).not.toBeNull()
    expect(mainBox).not.toBeNull()

    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width + 1)
    expect(mainBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1)
  })
}
