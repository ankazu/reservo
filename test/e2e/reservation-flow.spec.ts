import { expect, test } from '@playwright/test'

function formatDate(daysFromToday: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromToday)
  return date.toISOString().slice(0, 10)
}

test('guest searches, holds, securely reloads, confirms, and cancels a reservation', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('check-in').fill(formatDate(7))
  await page.getByTestId('check-out').fill(formatDate(9))
  await page.getByTestId('guests').selectOption('2')
  await page.getByTestId('check-out').press('Enter')

  const room = page
    .locator('[data-test^="choose-room-"]:not([disabled])')
    .first()
  await expect(room).toBeVisible()
  await room.click()
  await page.getByTestId('guest-name').fill('Playwright Guest')
  await page.getByTestId('guest-email').fill('playwright@example.com')

  const holdResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/reservations') &&
      response.request().method() === 'POST',
  )
  await page.getByTestId('create-hold').click()
  const holdResponse = await holdResponsePromise
  expect(holdResponse.status()).toBe(200)
  const payload = await holdResponse.json()
  expect(payload.success).toBe(true)
  const reservation = payload.data as {
    id: string
    accessToken: string
    accessUrl: string
  }

  await page.goto(reservation.accessUrl)
  await expect(page.getByTestId('reservation-details')).toHaveAttribute(
    'data-status',
    'PENDING_PAYMENT',
  )
  await expect(page.getByText('Playwright Guest')).toBeVisible()

  const secret = process.env.RESERVATION_MAINTENANCE_SECRET
  expect(secret).toBeTruthy()
  const confirm = await page.request.post(
    `/api/internal/reservations/${reservation.id}/confirm`,
    { headers: { 'X-Maintenance-Secret': secret! } },
  )
  expect(confirm.status()).toBe(200)
  await page.reload()
  await expect(page.getByTestId('reservation-details')).toHaveAttribute(
    'data-status',
    'CONFIRMED',
  )

  const cancel = await page.request.post(
    `/api/reservations/${reservation.id}/cancel`,
    { headers: { Authorization: `Bearer ${reservation.accessToken}` } },
  )
  expect(cancel.status()).toBe(200)
  await page.reload()
  await expect(page.getByTestId('reservation-details')).toHaveAttribute(
    'data-status',
    'CANCELLED',
  )
})
