'use client'

import { FileCode2, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exportResult } from '@/lib/export'
import type { VideoInfo } from '@/lib/types'

interface ExportMenuProps {
  video: VideoInfo
  /** 无时间戳的自然段落（formatTranscriptToArticle 派生） */
  paragraphs: string[]
}

/** 导出菜单：TXT / Markdown（纯文本全文，不含时间戳） */
export function ExportMenu({ video, paragraphs }: ExportMenuProps) {
  const handleExport = (format: 'txt' | 'md') => {
    exportResult(format, { video, paragraphs })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" title="导出纯文本，不含时间戳">
          <FileDown className="size-3.5" aria-hidden />
          导出
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>导出全文</DropdownMenuLabel>
        <p className="px-2 pb-1.5 text-xs text-muted-foreground">纯文本 · 不含时间戳</p>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleExport('txt')} className="gap-2">
          <FileDown className="size-4 text-muted-foreground" aria-hidden />
          纯文本（.txt）
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('md')} className="gap-2">
          <FileCode2 className="size-4 text-muted-foreground" aria-hidden />
          Markdown（.md）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
