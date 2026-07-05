import { useEffect } from 'react'

import { officialContent, type OfficialLocale } from './officialContent'

function ensureMeta(selector: string, create: () => HTMLMetaElement) {
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  if (existing) {
    return existing
  }

  const element = create()
  document.head.appendChild(element)
  return element
}

export function useOfficialSiteMeta(locale: OfficialLocale = 'zh') {
  useEffect(() => {
    const meta = officialContent[locale].meta
    const previousTitle = document.title
    const description = ensureMeta('meta[name="description"]', () => {
      const element = document.createElement('meta')
      element.name = 'description'
      return element
    })
    const ogTitle = ensureMeta('meta[property="og:title"]', () => {
      const element = document.createElement('meta')
      element.setAttribute('property', 'og:title')
      return element
    })
    const ogDescription = ensureMeta('meta[property="og:description"]', () => {
      const element = document.createElement('meta')
      element.setAttribute('property', 'og:description')
      return element
    })

    const previousDescription = description.content
    const previousOgTitle = ogTitle.content
    const previousOgDescription = ogDescription.content

    document.title = meta.title
    description.content = meta.description
    ogTitle.content = meta.title
    ogDescription.content = meta.description

    return () => {
      document.title = previousTitle
      description.content = previousDescription
      ogTitle.content = previousOgTitle
      ogDescription.content = previousOgDescription
    }
  }, [locale])
}
