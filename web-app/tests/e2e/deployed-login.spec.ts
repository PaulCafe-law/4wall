import { expect, test } from '@playwright/test'

const smokeEmail = process.env.PW_WEB_SMOKE_EMAIL
const smokePassword = process.env.PW_WEB_SMOKE_PASSWORD
const deployedBaseURL = process.env.PLAYWRIGHT_BASE_URL

test.describe('deployed browser login smoke', () => {
  test.skip(!deployedBaseURL || !smokeEmail || !smokePassword, 'requires deployed smoke credentials')

  test('invited user can sign into the deployed console', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.getByLabel('Email').fill(smokeEmail ?? '')
    await page.getByLabel('Password').fill(smokePassword ?? '')
    await page.getByRole('button', { name: 'Enter Console' }).click()

    await expect(page).toHaveURL(/\/missions(?:[/?#].*)?$/)
    await expect(page.getByRole('heading', { name: 'Missions' })).toBeVisible()
  })
})
