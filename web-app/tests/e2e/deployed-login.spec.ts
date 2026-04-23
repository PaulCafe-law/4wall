import { expect, test } from '@playwright/test'

const smokeEmail = process.env.PW_WEB_SMOKE_EMAIL
const smokePassword = process.env.PW_WEB_SMOKE_PASSWORD

test.skip(!smokeEmail || !smokePassword, 'requires deployed smoke credentials')

test('deployed beta login reaches the authenticated missions shell', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('電子郵件').fill(smokeEmail!)
  await page.getByLabel('密碼').fill(smokePassword!)
  await page
    .locator('form')
    .getByRole('button', { name: /^(登入工作區|進入主控台)$/ })
    .click()

  await page.waitForURL('**/missions')
  await expect(page.getByRole('heading', { name: '任務' })).toBeVisible()
  await expect(page.getByRole('link', { name: '場址' })).toBeVisible()
})
