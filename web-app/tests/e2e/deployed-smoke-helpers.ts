import { expect, type Page } from '@playwright/test'

export async function loginToAuthenticatedShell(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('form button[type="submit"]').click()

  await page.waitForURL(/\/$/)
  await expect(page.locator('header button').first()).toBeVisible({ timeout: 15_000 })
}

export async function waitForTeamSurface(page: Page) {
  const organizationDetailResponse = page
    .waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /\/v1\/organizations\/[^/]+$/.test(response.url()),
      { timeout: 60_000 },
    )
    .catch(() => null)

  const teamNavLink = page.locator('a[href="/team"]').first()
  await expect(teamNavLink).toBeVisible({ timeout: 15_000 })
  await teamNavLink.click()
  await expect(page).toHaveURL(/\/team(?:[/?#].*)?$/, { timeout: 15_000 })

  const organizationName = page.getByLabel('organization-name')
  try {
    await expect(organizationName).toBeVisible({ timeout: 60_000 })
    return
  } catch {
    const currentUrl = page.url()
    if (/\/login(?:[/?#].*)?$/.test(currentUrl)) {
      throw new Error('team smoke redirected back to /login after in-app team navigation')
    }

    const detailResponse = await organizationDetailResponse
    if (!detailResponse) {
      const bodyText = await page.locator('body').innerText()
      throw new Error(
        `team smoke never observed an organization detail request; likely no active organization membership or page bootstrap failure\nurl=${currentUrl}\nbody=${bodyText.slice(0, 600)}`,
      )
    }

    if (!detailResponse.ok()) {
      throw new Error(
        `team smoke organization detail request failed with ${detailResponse.status()} at ${detailResponse.url()}`,
      )
    }

    const bodyText = await page.locator('body').innerText()
    throw new Error(
      `team smoke fetched organization detail but the organization form never rendered\nurl=${currentUrl}\nbody=${bodyText.slice(0, 600)}`,
    )
  }
}
