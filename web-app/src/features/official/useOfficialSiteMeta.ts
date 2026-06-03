import { useEffect } from 'react'

const OFFICIAL_TITLE = '第四面牆 AI｜工地巡檢與虛擬工廠 Digital Twin'
const OFFICIAL_DESCRIPTION =
  '第四面牆 AI 提供智慧工地巡檢、現場影像監測、異常事件通報與虛擬工廠 Digital Twin 服務，協助管理者遠端掌握真實場域狀態。'

function ensureMeta(selector: string, create: () => HTMLMetaElement) {
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  if (existing) {
    return existing
  }

  const element = create()
  document.head.appendChild(element)
  return element
}

export function useOfficialSiteMeta() {
  useEffect(() => {
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

    document.title = OFFICIAL_TITLE
    description.content = OFFICIAL_DESCRIPTION
    ogTitle.content = OFFICIAL_TITLE
    ogDescription.content = OFFICIAL_DESCRIPTION

    return () => {
      document.title = previousTitle
      description.content = previousDescription
      ogTitle.content = previousOgTitle
      ogDescription.content = previousOgDescription
    }
  }, [])
}
