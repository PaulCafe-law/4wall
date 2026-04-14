import { expect, type Page } from '@playwright/test'

export async function loginToAuthenticatedShell(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  const loginResponsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/v1\/web\/session\/login$/.test(response.url()),
      { timeout: 15_000 },
    )
    .catch(() => null)

  await page.locator('form button[type="submit"]').click()

  const loginResponse = await loginResponsePromise
  if (!loginResponse) {
    const bodyText = await page.locator('body').innerText()
    throw new Error(
      `login smoke never observed a login API response\nurl=${page.url()}\nbody=${bodyText.slice(0, 600)}`,
    )
  }

  if (!loginResponse.ok()) {
    let detail = loginResponse.statusText()
    try {
      const payload = (await loginResponse.json()) as { detail?: string }
      detail = payload.detail ?? detail
    } catch {
      // fall back to the response status text
    }

    const bodyText = await page.locator('body').innerText()
    throw new Error(
      `login smoke failed with ${loginResponse.status()} detail=${detail}\nurl=${page.url()}\nbody=${bodyText.slice(0, 600)}`,
    )
  }

  try {
    await expect(page).toHaveURL(/\/(?:[?#].*)?$/, { timeout: 15_000 })
    await expect(page.locator('header button').first()).toBeVisible({ timeout: 15_000 })
  } catch {
    const bodyText = await page.locator('body').innerText()
    throw new Error(
      `login smoke succeeded at the API layer but authenticated shell never rendered\nurl=${page.url()}\nbody=${bodyText.slice(0, 600)}`,
    )
  }
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
