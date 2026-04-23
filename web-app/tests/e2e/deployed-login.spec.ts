import { expect, test } from '@playwright/test'

const smokeEmail = process.env.PW_WEB_SMOKE_EMAIL
const smokePassword = process.env.PW_WEB_SMOKE_PASSWORD

test.skip(!smokeEmail || !smokePassword, 'requires deployed smoke credentials')

test('deployed beta login reaches the authenticated shell', async ({ page }) => {
  await page.goto('/login')
  await page.locator('form input[type="email"]').fill(smokeEmail!)
  await page.locator('form input[type="password"]').fill(smokePassword!)
  await page.locator('form button[type="submit"]').click()

  await page.waitForFunction(() => window.location.pathname === '/missions', undefined, {
    timeout: 15_000,
  })
  await expect(page.locator('a[href="/sites"]').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('header button').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('main')).toBeVisible()
})
