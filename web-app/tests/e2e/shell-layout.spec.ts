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

    await page.route('**/v1/sites', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/v1/billing/invoices', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/login')
    await page.getByLabel(/電子郵件/).fill('platform@prod.internal.test')
    await page.getByLabel('密碼').fill('Password123!')
    await page.getByRole('button', { name: /登入工作區|進入主控台/ }).click()

    await expect(page).toHaveURL(/\/$/)

    const sidebar = page.locator('aside')
    const navs = page.locator('nav')
    const main = page.locator('main')

    await expect(sidebar).toBeVisible()
    await expect(navs).toHaveCount(2)
    await expect(page.getByRole('link', { name: '稽核記錄' })).toBeVisible()

    const [sidebarBox, mainBox] = await Promise.all([sidebar.boundingBox(), main.boundingBox()])
    const navBoxes = await Promise.all((await navs.all()).map((nav) => nav.boundingBox()))

    expect(sidebarBox).not.toBeNull()
    expect(mainBox).not.toBeNull()

    for (const navBox of navBoxes) {
      expect(navBox).not.toBeNull()
      expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width + 1)
    }
    expect(mainBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 1)
  })
}
