import { useEffect } from 'react'

const OFFICIAL_TITLE = '第四面牆 AI｜3D 鏡像工廠與 AI 現場管理平台'
const OFFICIAL_DESCRIPTION =
  '第四面牆 AI 把機台狀態、儀表讀值與異常事件收進 3D 鏡像工廠（Digital Twin）：AI 自動判讀儀表、HMI 與派工單，異常主動推進 LINE 群組，一句話查詢現場。已於台南射出成型工廠實裝運作。'

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
