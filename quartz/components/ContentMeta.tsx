interface ContentMetadataProps extends QuartzComponentProps {
  fileData: {
    // 添加 enableContentMeta 属性
    enableContentMeta?: boolean
    text: string
    dates?: Date[]
  }
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, displayClass }: ContentMetadataProps) {
    const text = fileData.text

    // Check if enableContentMeta is false
    if (fileData.enableContentMeta === false) {
      return null
    }

    if (text) {
      const segments: (string | JSX.Element)[] = []

      if (fileData.dates) {
        segments.push(formatDate(getDate(cfg, fileData)!, cfg.locale))
      }

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
