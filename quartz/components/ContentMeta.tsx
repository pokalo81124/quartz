import { formatDate, getDate } from "./Date"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { JSX } from "preact"
import style from "./styles/contentMeta.scss"

interface ContentMetaOptions {
  /**
   * Whether to display word count
   */
  showWordCount: boolean
  showComma: boolean
}

const defaultOptions: ContentMetaOptions = {
  showWordCount: true,
  showComma: true,
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  // Merge options with defaults
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, displayClass }: QuartzComponentProps) {
    const text = fileData.text

    // Check if frontmatter has enableContentMeta: false
    if (cfg.frontmatter?.enableContentMeta === false) {
      return null
    }

    if (text) {
      const segments: (string | JSX.Element)[] = []

      if (fileData.dates) {
        segments.push(formatDate(getDate(cfg, fileData)!, cfg.locale))
      }

      // Display word count if enabled
      if (options.showWordCount) {
        const englishWordCount = text.match(/\b\w+\b/g)?.length || 0
        const chineseCharCount = text.match(/[\u4e00-\u9fff]/g)?.length || 0
        const totalWordCount = englishWordCount + chineseCharCount

        const displayedWordCount = i18n(cfg.locale).components.contentMeta.readingTime({
          minutes: totalWordCount,
        })
        segments.push(displayedWordCount)
      }

      const segmentsElements = segments.map((segment) => <span>{segment}</span>)

      return (
        <p show-comma={options.showComma} class={classNames(displayClass, "content-meta")}>
          {segmentsElements}
        </p>
      )
    } else {
      return null
    }
  }

  ContentMetadata.css = style

  return ContentMetadata
}) satisfies QuartzComponentConstructor
