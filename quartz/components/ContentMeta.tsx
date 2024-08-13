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
  showByDefault: boolean // 新增默认选项，控制组件是否显示
}

const defaultOptions: ContentMetaOptions = {
  showWordCount: true,
  showComma: true,
  showByDefault: true, // 默认情况下显示组件
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  // Merge options with defaults
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, displayClass }: QuartzComponentProps) {
    // 新增enableContentMeta的判定逻辑
    const display = fileData.frontmatter?.enableContentMeta ?? options.showByDefault

    if (!display) {
      return null
    }

    const text = fileData.text

    if (text) {
      const segments: (string | JSX.Element)[] = []

      if (fileData.dates) {
        segments.push(formatDate(getDate(cfg, fileData)!, cfg.locale))
      }

      // Display word count if enabled
      if (options.showWordCount) {
        // 英文单词统计：匹配字母、数字、下划线组成的单词
        const englishWordCount = text.match(/\b\w+\b/g)?.length || 0
        // 中文字符统计：匹配中文字符
        const chineseCharCount = text.match(/[\u4e00-\u9fff]/g)?.length || 0
        // 总字数
        const totalWordCount = englishWordCount + chineseCharCount

        const displayedWordCount = i18n(cfg.locale).components.contentMeta.readingTime({
          minutes: totalWordCount, // 传递字数作为参数
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
