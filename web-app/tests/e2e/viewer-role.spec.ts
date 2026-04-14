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

test('customer viewer can browse but cannot see site mutation controls or internal navigation', async ({ page }) => {
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
          createdAt: '2026-04-10T00:00:00Z',
          updatedAt: '2026-04-10T00:00:00Z',
        },
      ]),
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
  await page.getByLabel(/電子郵件/).fill('viewer@test.dev')
  await page.getByLabel('密碼').fill('Password123!')
  await page.getByRole('button', { name: /登入工作區|進入主控台/ }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: '組織' })).toHaveCount(0)
  await page.getByRole('link', { name: '場址' }).click()

  await expect(page.getByRole('link', { name: /Viewer Site/i })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增場址' })).toHaveCount(0)
})
