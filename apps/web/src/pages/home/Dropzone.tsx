import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react"
import { Button } from "../../components/Button.tsx"
import { UploadTrayIcon } from "../../components/icons.tsx"
import { cx } from "../../lib/cx.ts"
import { formatBytes } from "../../lib/format.ts"
import { ACCEPTED_MIME_TYPES, MAX_BATCH_FILES } from "./compressorRules.ts"

const Ruler = () => {
  const patternId = useId()
  return (
    <svg role="img" aria-label="刻度尺" className="block h-3.5 w-full">
      <defs>
        <pattern id={patternId} width="50" height="14" patternUnits="userSpaceOnUse">
          <line x1="0.5" y1="2" x2="0.5" y2="14" strokeWidth="1" className="stroke-ink" />
          <line x1="10.5" y1="9" x2="10.5" y2="14" strokeWidth="1" className="stroke-ink" />
          <line x1="20.5" y1="9" x2="20.5" y2="14" strokeWidth="1" className="stroke-ink" />
          <line x1="30.5" y1="9" x2="30.5" y2="14" strokeWidth="1" className="stroke-ink" />
          <line x1="40.5" y1="9" x2="40.5" y2="14" strokeWidth="1" className="stroke-ink" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" className="fill-paper" />
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}

const preventBrowserFileDrop = (event: Event) => event.preventDefault()

export const Dropzone = ({
  onFiles,
  maxFileSize,
  children,
}: {
  onFiles: (files: File[]) => void
  maxFileSize: number | null
  children?: ReactNode
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    window.addEventListener("dragover", preventBrowserFileDrop)
    window.addEventListener("drop", preventBrowserFileDrop)
    return () => {
      window.removeEventListener("dragover", preventBrowserFileDrop)
      window.removeEventListener("drop", preventBrowserFileDrop)
    }
  }, [])

  const openPicker = () => inputRef.current?.click()

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  const sizeHint = maxFileSize === null ? "" : ` · 每张 ${formatBytes(maxFileSize, { trim: true })} 以内`

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest("a, button, input")) return
        openPicker()
      }}
      className={cx(
        "flex cursor-pointer flex-col overflow-hidden rounded-card border-frame bg-surface transition-colors",
        dragging ? "border-vermilion" : "border-ink",
      )}
    >
      <Ruler />
      <div className="flex flex-col items-center gap-3 px-5 pb-6 pt-8 text-center md:gap-4 md:px-10 md:pb-10 md:pt-14">
        <UploadTrayIcon label="拖入图片" className="size-9 text-ink md:size-11" />
        <button type="button" onClick={openPicker} className="font-medium text-heading-sm text-ink md:text-heading-lg">
          <span className="md:hidden">点击选择图片</span>
          <span className="hidden md:inline">拖入图片，或点击选择</span>
        </button>
        <p className="text-label text-ink-secondary md:text-ui">
          <span className="md:hidden">
            最多 {MAX_BATCH_FILES} 张{sizeHint}
          </span>
          <span className="hidden md:inline">
            单次最多 {MAX_BATCH_FILES} 张{sizeHint} · PNG / JPEG / GIF
          </span>
        </p>
        <Button variant="ink" size="xl" onClick={openPicker} className="mt-1.5 w-full rounded-tile text-ui-lg md:hidden">
          选择图片
        </Button>
        {children}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={ACCEPTED_MIME_TYPES.join(",")}
        aria-label="选择图片文件"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ""
          if (files.length > 0) onFiles(files)
        }}
      />
    </div>
  )
}
