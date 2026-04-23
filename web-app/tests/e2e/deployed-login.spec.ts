import { expect, test } from '@playwright/test'

const smokeEmail = process.env.PW_WEB_SMOKE_EMAIL
const smokePassword = process.env.PW_WEB_SMOKE_PASSWORD

test.skip(!smokeEmail || !smokePassword, 'requires deployed smoke credentials')

test('deployed beta login reaches the authenticated shell', async ({ page }) => {
  await page.goto('/login')
  await page.locator('form input[type="email"]').fill(smokeEmail!)
  await page.locator('form input[type="password"]').fill(smokePassword!)
  await page.locator('form button[type="submit"]').click()

  const sidebar = page.locator('aside').first()
  await expect(sidebar).toBeVisible()
  await expect(sidebar.locator('a[href="/sites"]').first()).toBeVisible()
  await expect(page.locator('main')).toBeVisible()
})
