import { useEffect, useRef, useState, type ReactNode } from "react"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { cx } from "../lib/cx.ts"
import { CopyIcon } from "./icons.tsx"

export type CodeTone = "night" | "nightInset" | "panel"

const toneClass: Record<CodeTone, string> = {
  night: "bg-night text-night-text",
  nightInset: "bg-night-code text-night-text",
  panel: "bg-panel text-ink",
}

const copyButtonClass: Record<CodeTone, string> = {
  night: "bg-night text-night-muted hover:text-night-text",
  nightInset: "bg-night text-night-muted hover:text-night-text",
  panel: "bg-surface text-ink-secondary hover:text-ink",
}

export const CodeBlock = ({
  children,
  tone = "night",
  className,
  label,
}: {
  children: ReactNode
  tone?: CodeTone
  className?: string
  label?: string
}) => {
  const { t } = useI18n()
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    const text = preRef.current?.textContent
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="relative">
      <pre
        ref={preRef}
        aria-label={label}
        className={cx(
          "overflow-x-auto whitespace-pre rounded-control px-5 py-4.5 font-mono text-code",
          toneClass[tone],
          className,
        )}
      >
        <code>{children}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className={cx(
          "absolute right-2 top-2 flex items-center gap-1.5 rounded-control px-2 py-1 text-label",
          copyButtonClass[tone],
        )}
      >
        <CopyIcon className="size-3.5" />
        {copied ? t("code.copied") : t("code.copy")}
      </button>
    </div>
  )
}
