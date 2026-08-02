import { timingSafeEqual } from 'node:crypto'

export function isMaintenanceSecretValid(
  providedSecret: string | undefined,
  configuredSecret: string | undefined,
) {
  if (!providedSecret || !configuredSecret) return false

  const provided = Buffer.from(providedSecret)
  const configured = Buffer.from(configuredSecret)
  return (
    provided.length === configured.length &&
    timingSafeEqual(provided, configured)
  )
}
