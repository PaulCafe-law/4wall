import { expect, test } from '@playwright/test'

const adminEmail = process.env.PW_WEB_SMOKE_ADMIN_EMAIL
const adminPassword = process.env.PW_WEB_SMOKE_ADMIN_PASSWORD

test.skip(!adminEmail || !adminPassword, 'requires deployed admin smoke credentials')

test('deployed admin login reaches customer shell with team management controls', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(adminEmail!)
  await page.locator('input[type="password"]').fill(adminPassword!)
  await page.locator('form button[type="submit"]').click()

  await page.waitForURL(/\/$/)
  await expect(page.getByRole('button', { name: /登出|Logout|Log out/ })).toBeVisible()

  await page.goto('/team')
  await expect(page.getByLabel('invite-team-member')).toBeVisible()
  await expect(page.getByLabel('save-organization')).toBeEnabled()
})
