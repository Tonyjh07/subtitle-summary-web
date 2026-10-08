'use client'

import { BookOpenText } from 'lucide-react'

interface ArticleViewProps {
  paragraphs: string[]
}

/** 全文阅读视图内容（无时间戳的文章式排版，由文字稿派生） */
export function ArticleView({ paragraphs }: ArticleViewProps) {
  const totalChars = paragraphs.join('').length
  const readingMinutes = Math.max(1, Math.round(totalChars / 400))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BookOpenText className="size-3.5 text-primary" aria-hidden />
        <span className="tabular-nums">
          {totalChars} 字 · 约 {readingMinutes} 分钟读完 · 按章节自动分段
        </span>
      </div>
      <article className="mx-auto max-w-3xl" data-testid="fulltext-article">
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            className="mb-6 text-justify text-[15px] leading-[1.9] text-foreground/90 last:mb-0 sm:text-base"
          >
            {paragraph}
          </p>
        ))}
      </article>
    </div>
  )
}
