import { expect, test } from '@playwright/test'

import { loginToAuthenticatedShell, waitForTeamSurface } from './deployed-smoke-helpers'

const viewerEmail = process.env.PW_WEB_SMOKE_VIEWER_EMAIL
const viewerPassword = process.env.PW_WEB_SMOKE_VIEWER_PASSWORD

test.skip(!viewerEmail || !viewerPassword, 'requires deployed viewer smoke credentials')
test.setTimeout(90_000)

test('deployed viewer login stays read-only on team surfaces', async ({ page }) => {
  await loginToAuthenticatedShell(page, viewerEmail!, viewerPassword!)
  await waitForTeamSurface(page)
  await expect(page.locator('a[href="/organizations"]')).toHaveCount(0)
  await expect(page.getByLabel('invite-team-member')).toHaveCount(0)
  await expect(page.getByLabel('save-organization')).toBeDisabled({ timeout: 60_000 })
})
