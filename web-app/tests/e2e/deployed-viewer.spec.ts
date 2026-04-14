import { expect, test } from '@playwright/test'

const viewerEmail = process.env.PW_WEB_SMOKE_VIEWER_EMAIL
const viewerPassword = process.env.PW_WEB_SMOKE_VIEWER_PASSWORD

test.skip(!viewerEmail || !viewerPassword, 'requires deployed viewer smoke credentials')

test('deployed viewer login stays read-only on team surfaces', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(viewerEmail!)
  await page.locator('input[type="password"]').fill(viewerPassword!)
  await page.locator('form button[type="submit"]').click()

  await page.waitForURL(/\/$/)

  await page.goto('/team')
  await expect(page.locator('a[href="/organizations"]')).toHaveCount(0)
  await expect(page.getByLabel('invite-team-member')).toHaveCount(0)
  await expect(page.getByLabel('save-organization')).toBeDisabled()
})
