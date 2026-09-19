import { useCallback, useMemo, useRef, useState } from "react"
import { ErrorCode, errorMessage, fetchTask, isApiError, uploadImage } from "../../api/client.ts"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { createUploadQueue } from "../../lib/uploadQueue.ts"
import { useSession } from "../../session/sessionContext.ts"
import {
  CONVERSION_EXTRA_UNITS,
  JPEG_FLATTEN_BACKGROUND,
  MAX_BATCH_FILES,
  MAX_POLLS_PER_TASK,
  POLL_WAIT_SECONDS,
  detectFormat,
  effectiveTarget,
  summarize,
  validateFiles,
  type CompressionItem,
  type OutputChoice,
  type RejectedFile,
  type TargetFormat,
} from "./compressorRules.ts"

export const useCompressor = () => {
  const { t } = useI18n()
  const { me, applyQuota } = useSession()
  const [items, setItems] = useState<CompressionItem[]>([])
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const [batchNotice, setBatchNotice] = useState<string | null>(null)
  const [quotaExhausted, setQuotaExhausted] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [output, setOutput] = useState<OutputChoice>("keep")
  const queueRef = useRef(createUploadQueue())
  const exhaustedRef = useRef(false)

  const maxFileSize = me?.plan.max_file_size ?? null
  const remaining = me?.quota.remaining ?? null

  const update = useCallback((id: string, patch: Partial<CompressionItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const markExhausted = useCallback(
    (id: string) => {
      exhaustedRef.current = true
      setQuotaExhausted(true)
      update(id, { stage: "failed", error: t("home.error.quota"), queuePosition: null })
    },
    [t, update],
  )

  const processFile = useCallback(
    async (id: string, file: File, target: TargetFormat | null) => {
      if (exhaustedRef.current) {
        markExhausted(id)
        return
      }
      update(id, { stage: "uploading", uploadRatio: 0 })
      try {
        const upload = await uploadImage(file, {
          convert: target,
          background: target === "jpeg" ? JPEG_FLATTEN_BACKGROUND : null,
          onProgress: (ratio) => update(id, { uploadRatio: ratio }),
        })
        applyQuota(upload.quota)
        update(id, { stage: "queued", uploadRatio: 1 })
        for (let polls = 0; polls < MAX_POLLS_PER_TASK; polls += 1) {
          const { data: task, quota } = await fetchTask(upload.data.task_id, POLL_WAIT_SECONDS)
          if (task.status === "completed") {
            applyQuota(quota)
            update(id, {
              stage: "completed",
              queuePosition: null,
              compressedSize: task.compressed_size,
              compressedUrl: task.compressed_url,
              quotaUnits: task.quota_units,
            })
            return
          }
          if (task.status === "failed") {
            applyQuota(quota)
            update(id, { stage: "failed", queuePosition: null, error: task.error_msg || t("row.compressFailed") })
            return
          }
          update(id, {
            stage: task.status === "processing" ? "processing" : "queued",
            queuePosition: task.queue_position,
          })
        }
        update(id, { stage: "failed", queuePosition: null, error: t("home.error.timeout") })
      } catch (error) {
        if (isApiError(error) && error.code === ErrorCode.quotaExhausted) {
          markExhausted(id)
          return
        }
        if (isApiError(error) && error.code === ErrorCode.fileTooLarge) {
          update(id, { stage: "failed", queuePosition: null, error: t("home.error.tooLarge") })
          return
        }
        update(id, { stage: "failed", queuePosition: null, error: errorMessage(error, t("home.error.network")) })
      }
    },
    [applyQuota, markExhausted, t, update],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      const validation = validateFiles(files, maxFileSize, {
        unsupported: t("dropzone.reject.formats", { formats: t("formats.list") }),
        heic: t("dropzone.reject.heic"),
        tooLarge: (limit) => t("dropzone.reject.tooLarge", { size: limit }),
      })
      setRejected(validation.rejected)
      setBatchNotice(validation.truncated ? t("home.notice.truncated", { count: MAX_BATCH_FILES }) : null)
      if (validation.accepted.length === 0) return
      if (exhaustedRef.current || remaining === 0) {
        setQuotaExhausted(true)
        return
      }
      const fresh = validation.accepted.map((file): CompressionItem => {
        const format = detectFormat(file.name, file.type) ?? "PNG"
        const target = effectiveTarget(format, output)
        return {
          id: crypto.randomUUID(),
          name: file.name,
          format,
          target,
          quotaUnits: 1 + (target === null ? 0 : CONVERSION_EXTRA_UNITS),
          originalSize: file.size,
          stage: "waiting",
          uploadRatio: 0,
          queuePosition: null,
          compressedSize: null,
          compressedUrl: null,
          error: null,
        }
      })
      setItems((current) => [...current, ...fresh])
      fresh.forEach((item, index) => {
        const file = validation.accepted[index]
        if (file) void queueRef.current.enqueue(() => processFile(item.id, file, item.target))
      })
    },
    [maxFileSize, output, processFile, remaining, t],
  )

  const dismissNotices = useCallback(() => {
    setRejected([])
    setBatchNotice(null)
  }, [])

  const summary = useMemo(() => summarize(items), [items])

  return {
    items,
    rejected,
    batchNotice,
    quotaExhausted,
    summary,
    downloading,
    output,
    setOutput,
    setDownloading,
    addFiles,
    dismissNotices,
  }
}
