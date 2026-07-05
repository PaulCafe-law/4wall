import { Link } from 'react-router-dom'

import { officialContent, type OfficialLocale } from './officialContent'
import { useOfficialSiteMeta } from './useOfficialSiteMeta'

type Content = (typeof officialContent)['zh']

function CtaLink({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: string
  variant?: 'primary' | 'secondary'
}) {
  const classes =
    variant === 'primary'
      ? 'bg-[#0071e3] text-white hover:bg-[#0077ed]'
      : 'border border-[#0071e3] text-[#0071e3] hover:bg-[#0071e3] hover:text-white'

  return (
    <a className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium transition ${classes}`} href={href}>
      {children}
    </a>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-4xl text-center">
      <h2 className="font-display text-4xl font-semibold tracking-[-0.01em] text-chrome-950 md:text-6xl">{title}</h2>
      {subtitle ? <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-chrome-700">{subtitle}</p> : null}
    </div>
  )
}

function ProactiveAlertMock({ t }: { t: Content['proactiveAlert'] }) {
  return (
    <div className="flex h-full flex-col bg-[#8aa6c2]/25 p-5 md:p-6">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chrome-950 font-display text-[11px] font-semibold text-white">
          4W
        </span>
        <span className="text-xs font-medium text-chrome-700">{t.botName}</span>
      </div>
      <div className="mt-4 flex flex-1 flex-col justify-center">
        <div className="mr-auto w-full max-w-[92%] overflow-hidden rounded-2xl rounded-bl-md bg-chrome-950 text-white shadow-sm">
          <div className="flex items-center justify-between px-4 pt-3">
            <span className="rounded-full bg-ember-500/20 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ember-300">
              {t.tag}
            </span>
            <span className="font-mono text-[10px] text-chrome-400">{t.time}</span>
          </div>
          <p className="mt-2 px-4 font-display text-base font-semibold leading-6">{t.title}</p>
          <p className="mt-1 px-4 pb-3 text-sm leading-6 text-chrome-300">{t.body}</p>
          <div className="border-t border-white/10 px-4 py-2.5 text-xs text-moss-300">✓ {t.dispatch}</div>
        </div>
      </div>
    </div>
  )
}

type ServiceCardData = {
  title: string
  body: string
  mock?: 'alert'
  image?: string
  alt?: string
  width?: number
  height?: number
  contain?: boolean
}

function ServiceCard({ card, t }: { card: ServiceCardData; t: Content }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[2rem] bg-white text-chrome-950 shadow-[0_18px_70px_rgba(18,24,33,0.1)]">
      <div className="px-6 pt-7 text-center md:px-10 md:pt-10">
        <h3 className="font-display text-3xl font-semibold tracking-[-0.01em] md:text-4xl">{card.title}</h3>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-chrome-700 md:text-base">{card.body}</p>
      </div>
      <div className="mt-6 flex min-h-[20rem] flex-1 overflow-hidden">
        {card.mock === 'alert' ? (
          <div className="flex-1">
            <ProactiveAlertMock t={t.proactiveAlert} />
          </div>
        ) : card.image && card.contain ? (
          <div className="flex flex-1 items-center justify-center bg-[#8aa6c2]/20 px-6 py-8">
            <img
              className="max-h-[22rem] w-auto max-w-full rounded-2xl shadow-[0_10px_40px_rgba(18,24,33,0.18)]"
              src={card.image}
              alt={card.alt}
              width={card.width}
              height={card.height}
              loading="lazy"
            />
          </div>
        ) : card.image ? (
          <img
            className="h-[22rem] w-full object-cover md:h-[26rem]"
            src={card.image}
            alt={card.alt}
            width={card.width}
            height={card.height}
            loading="lazy"
          />
        ) : null}
      </div>
    </article>
  )
}

export function OfficialSitePage({ locale = 'zh' }: { locale?: OfficialLocale }) {
  const t = officialContent[locale]
  useOfficialSiteMeta(locale)
  const mailHref = `mailto:4wallaitech@gmail.com?subject=${t.contact.mailSubject}`

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-chrome-950">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f5f5f7]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <a href="#top" className="font-display text-sm font-semibold tracking-[-0.02em] text-chrome-950">
            {locale === 'zh' ? '第四面牆 AI' : '4WALL AI'}
          </a>
          <nav className="hidden items-center gap-6 text-xs text-chrome-700 md:flex">
            <a className="transition hover:text-chrome-950" href="#services">{t.nav.services}</a>
            <a className="transition hover:text-chrome-950" href="#day">{t.nav.day}</a>
            <a className="transition hover:text-chrome-950" href="#case">{t.nav.caseStudy}</a>
            <a className="transition hover:text-chrome-950" href="#pricing">{t.nav.pricing}</a>
            <a className="transition hover:text-chrome-950" href="#security">{t.nav.security}</a>
          </nav>
          <div className="flex items-center gap-4">
            <Link className="text-xs font-medium text-chrome-700 transition hover:text-chrome-950" rel="nofollow" to={t.nav.langHref}>
              {t.nav.langSwitch}
            </Link>
            <Link className="hidden text-xs text-chrome-700 transition hover:text-chrome-950 md:inline" rel="nofollow" to="/login">
              {t.nav.login}
            </Link>
            <a className="rounded-full bg-chrome-950 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-chrome-800" href="#contact">
              {t.nav.contact}
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto max-w-7xl px-4 pb-6 pt-12 md:pt-20">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="text-balance font-display text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-chrome-950 md:text-7xl lg:text-8xl">
              {t.hero.title}
            </h1>
            <p className="mx-auto mt-6 max-w-4xl text-xl leading-9 text-chrome-700 md:text-2xl">{t.hero.subtitle}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <CtaLink href="#contact">{t.hero.ctaPrimary}</CtaLink>
              <CtaLink href="#services" variant="secondary">{t.hero.ctaSecondary}</CtaLink>
            </div>
          </div>

          <figure className="mt-12">
            <div className="overflow-hidden rounded-[2.5rem] bg-chrome-950 shadow-[0_30px_100px_rgba(18,24,33,0.28)]">
              <img
                className="w-full"
                src="/official-assets/warroom-live.webp"
                alt={t.warRoom.imageAlt}
                width={1552}
                height={657}
                fetchPriority="high"
              />
            </div>
            <figcaption className="mt-3 text-center text-xs text-chrome-500">{t.warRoom.caption}</figcaption>
          </figure>

          <div className="mt-5 grid gap-4 rounded-[2rem] bg-white px-6 py-6 shadow-[0_18px_70px_rgba(18,24,33,0.08)] sm:grid-cols-2 md:px-8 lg:grid-cols-4">
            {t.stats.map((stat) => (
              <div key={stat.value} className="text-center lg:text-left">
                <p className="font-display text-3xl font-semibold tracking-[-0.01em] text-chrome-950 md:text-4xl">{stat.value}</p>
                <p className="mt-1 text-sm leading-6 text-chrome-700">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6">
          <h2 className="sr-only">{t.problemsHeading}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {t.problems.map((item) => (
              <article key={item.title} className="rounded-[2rem] bg-white px-6 py-8 text-center shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                <h3 className="font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-chrome-700">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="services" className="scroll-mt-20 px-4 py-10">
          <SectionHeading title={t.services.title} subtitle={t.services.subtitle} />
          <div className="mx-auto mt-10 grid max-w-7xl gap-5 lg:grid-cols-2">
            {t.services.cards.map((card) => (
              <ServiceCard key={card.title} card={card as ServiceCardData} t={t} />
            ))}
          </div>
          <div className="mx-auto mt-5 max-w-7xl rounded-[2rem] bg-white px-6 py-6 text-center shadow-[0_18px_70px_rgba(18,24,33,0.08)] md:px-8">
            <p className="mx-auto max-w-4xl text-sm leading-7 text-chrome-700 md:text-base">{t.services.engineNote}</p>
          </div>
        </section>

        <section id="day" className="scroll-mt-20 bg-white px-4 py-16 md:py-24">
          <SectionHeading title={t.day.title} subtitle={t.day.subtitle} />
          <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-4">
            {t.day.steps.map((step) => (
              <article key={step.time} className="rounded-[2rem] bg-[#f5f5f7] px-6 py-8">
                <p className="font-mono text-sm font-semibold tracking-[0.08em] text-ember-600">{step.time}</p>
                <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-chrome-700">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="case" className="scroll-mt-20 px-4 py-14 md:py-20">
          <SectionHeading title={t.caseStudy.heading} subtitle={t.caseStudy.subheading} />
          <div className="mx-auto mt-10 max-w-7xl overflow-hidden rounded-[2.5rem] bg-chrome-950 text-white shadow-[0_18px_70px_rgba(18,24,33,0.16)]">
            <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
              <div className="flex flex-col justify-center px-7 py-10 md:px-10">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-300">{t.caseStudy.tag}</p>
                <h3 className="mt-3 font-display text-4xl font-semibold tracking-[-0.01em] md:text-5xl">{t.caseStudy.name}</h3>
                <p className="mt-5 max-w-2xl text-base leading-8 text-chrome-200">{t.caseStudy.body}</p>
                <div className="mt-8 flex flex-wrap gap-2">
                  {t.caseStudy.chips.map((chip) => (
                    <span key={chip} className="rounded-full bg-white/10 px-4 py-2 text-sm text-chrome-100">{chip}</span>
                  ))}
                </div>
              </div>
              <img
                className="h-full min-h-[20rem] w-full object-cover"
                src="/official-assets/industrial-data-engine-control-room.webp"
                alt={t.caseStudy.imageAlt}
                width={1672}
                height={941}
                loading="lazy"
              />
            </div>
          </div>
          <div className="mx-auto mt-6 grid max-w-5xl gap-5 md:grid-cols-2">
            {t.partners.map((partner) => (
              <article key={partner.name} className="rounded-[2rem] bg-white px-7 py-8 shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-moss-500">{t.partnersTag}</p>
                <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{partner.name}</h3>
                <p className="mt-2 text-sm font-medium text-ember-600">{partner.tag}</p>
                <p className="mt-4 text-sm leading-7 text-chrome-700">{partner.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 bg-white px-4 py-16 md:py-24">
          <SectionHeading title={t.pricing.title} subtitle={t.pricing.subtitle} />
          <div className="mx-auto mt-10 grid max-w-7xl gap-5 md:grid-cols-3">
            {t.pricing.tiers.map((tier) => (
              <article
                key={tier.name}
                className={`flex flex-col rounded-[2rem] px-7 py-9 ${
                  tier.highlight ? 'bg-chrome-950 text-white shadow-[0_18px_70px_rgba(18,24,33,0.2)]' : 'bg-[#f5f5f7] text-chrome-950'
                }`}
              >
                <h3 className="font-display text-2xl font-semibold tracking-[-0.01em]">{tier.name}</h3>
                <p className={`mt-5 font-display text-3xl font-semibold tracking-[-0.01em] ${tier.highlight ? 'text-white' : 'text-chrome-950'}`}>
                  {tier.price}
                </p>
                <p className={`mt-1 text-sm ${tier.highlight ? 'text-chrome-300' : 'text-chrome-600'}`}>{tier.setup}</p>
                <p className={`mt-5 text-sm leading-7 ${tier.highlight ? 'text-chrome-200' : 'text-chrome-700'}`}>{tier.body}</p>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-7 text-chrome-700">{t.pricing.roi}</p>
        </section>

        <section id="onboarding" className="scroll-mt-20 px-4 py-16 md:py-24">
          <SectionHeading title={t.onboarding.title} subtitle={t.onboarding.subtitle} />
          <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-3">
            {t.onboarding.steps.map((step, index) => (
              <article key={step.title} className="rounded-[2rem] bg-white px-6 py-8 shadow-[0_18px_70px_rgba(18,24,33,0.08)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf6f2] font-mono text-sm font-semibold text-moss-600">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-chrome-700">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="security" className="scroll-mt-20 bg-white px-4 py-16 md:py-24">
          <SectionHeading title={t.security.title} subtitle={t.security.subtitle} />
          <div className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-3">
            {t.security.points.map((point) => (
              <article key={point.title} className="rounded-[2rem] bg-[#f5f5f7] px-6 py-8">
                <h3 className="font-display text-2xl font-semibold tracking-[-0.01em] text-chrome-950">{point.title}</h3>
                <p className="mt-3 text-sm leading-7 text-chrome-700">{point.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="contact" className="scroll-mt-20 px-4 py-14">
          <div className="mx-auto max-w-7xl rounded-[2.5rem] bg-chrome-950 px-6 py-14 text-center text-white md:px-10 md:py-20">
            <h2 className="font-display text-4xl font-semibold tracking-[-0.01em] md:text-6xl">{t.contact.title}</h2>
            <p className="mx-auto mt-5 max-w-3xl text-base leading-8 text-chrome-200">{t.contact.body}</p>
            <a
              className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-chrome-950 transition hover:bg-chrome-100"
              href={mailHref}
            >
              4wallaitech@gmail.com
            </a>
            <p className="mt-6 text-sm text-chrome-400">{t.contact.teamLine}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-display text-sm font-semibold tracking-[-0.02em] text-chrome-950">第四面牆 4WALL AI</p>
            <p className="mt-2 max-w-sm text-xs leading-6 text-chrome-600">{t.footer.blurb}</p>
            <p className="mt-3 text-xs text-chrome-500">{t.footer.location}</p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-chrome-600">
            <a className="transition hover:text-chrome-950" href="#services">{t.nav.services}</a>
            <a className="transition hover:text-chrome-950" href="#case">{t.nav.caseStudy}</a>
            <a className="transition hover:text-chrome-950" href="#pricing">{t.nav.pricing}</a>
            <a className="transition hover:text-chrome-950" href="#security">{t.nav.security}</a>
          </div>
          <div className="flex flex-col gap-2 text-xs text-chrome-600">
            <a className="transition hover:text-chrome-950" href="mailto:4wallaitech@gmail.com">4wallaitech@gmail.com</a>
            <Link className="transition hover:text-chrome-950" rel="nofollow" to={t.nav.langHref}>{t.nav.langSwitch}</Link>
            <Link className="transition hover:text-chrome-950" rel="nofollow" to="/login">{t.nav.login}</Link>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-[11px] text-chrome-400">{t.footer.rights}</p>
      </footer>
    </div>
  )
}
