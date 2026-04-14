import { expect, test } from '@playwright/test'

import { loginToAuthenticatedShell, waitForTeamSurface } from './deployed-smoke-helpers'

const adminEmail = process.env.PW_WEB_SMOKE_ADMIN_EMAIL
const adminPassword = process.env.PW_WEB_SMOKE_ADMIN_PASSWORD

test.skip(!adminEmail || !adminPassword, 'requires deployed admin smoke credentials')
test.setTimeout(90_000)

test('deployed customer admin can manage team surfaces', async ({ page }) => {
  await loginToAuthenticatedShell(page, adminEmail!, adminPassword!)
  await waitForTeamSurface(page)
  await expect(page.getByLabel('invite-team-member')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByLabel('save-organization')).toBeEnabled({ timeout: 60_000 })
})
