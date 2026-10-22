// Site-level switches for the official website.

export type PrimaryCta = 'demo' | 'start'

export const OFFICIAL_CONFIG = {
  /**
   * Which CTA gets the filled button. The founder wants "Get started" to lead
   * from www.4wall.io into platform.4wall.io, so 'start' is primary; flip to
   * 'demo' to make booking a demo the main action instead.
   */
  PRIMARY_CTA: 'start' as PrimaryCta,
  PLATFORM_URL: 'https://platform.4wall.io',
  CONTACT_EMAIL: 'admin@4wall.io',
}
