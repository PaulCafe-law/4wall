import { useEffect } from 'react'

const OFFICIAL_TITLE = '第四面牆 AI｜工地與工廠現場管理、Digital Twin 與 AI 資料引擎'
const OFFICIAL_DESCRIPTION =
  '第四面牆 AI 整合工地與工廠影像、巡檢紀錄、Digital Twin、事件追蹤與 LINE 通報，並建置 Industrial Data Engine 作為現場事件辨識模型的底層 AI 訓練資料與驗證能力。'

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
