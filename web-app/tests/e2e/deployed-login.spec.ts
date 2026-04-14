import { test } from '@playwright/test'

import { loginToAuthenticatedShell } from './deployed-smoke-helpers'

const adminEmail = process.env.PW_WEB_SMOKE_ADMIN_EMAIL
const adminPassword = process.env.PW_WEB_SMOKE_ADMIN_PASSWORD

test.skip(!adminEmail || !adminPassword, 'requires deployed admin smoke credentials')

test('deployed admin login reaches the authenticated shell', async ({ page }) => {
  await loginToAuthenticatedShell(page, adminEmail!, adminPassword!)
})
