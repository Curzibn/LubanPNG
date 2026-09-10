import { useCallback, useMemo, useRef, useState } from "react"
import { ErrorCode, errorMessage, fetchTask, isApiError, uploadImage } from "../../api/client.ts"
import { createUploadQueue } from "../../lib/uploadQueue.ts"
import { useSession } from "../../session/sessionContext.ts"
import {
  MAX_BATCH_FILES,
  MAX_POLLS_PER_TASK,
  POLL_WAIT_SECONDS,
  detectFormat,
  summarize,
  validateFiles,
  type CompressionItem,
  type RejectedFile,
} from "./compressorRules.ts"

const QUOTA_EXHAUSTED_ERROR = "额度已用完"
const FILE_TOO_LARGE_ERROR = "文件超过大小上限"
const POLL_TIMEOUT_ERROR = "等待超时，请稍后在工作台查看"
const TRUNCATED_NOTICE = `单次最多 ${MAX_BATCH_FILES} 张，本次只处理前 ${MAX_BATCH_FILES} 张。`

export const useCompressor = () => {
  const { me, applyQuota } = useSession()
  const [items, setItems] = useState<CompressionItem[]>([])
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const [batchNotice, setBatchNotice] = useState<string | null>(null)
  const [quotaExhausted, setQuotaExhausted] = useState(false)
  const [downloading, setDownloading] = useState(false)
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
      update(id, { stage: "failed", error: QUOTA_EXHAUSTED_ERROR, queuePosition: null })
    },
    [update],
  )

  const processFile = useCallback(
    async (id: string, file: File) => {
      if (exhaustedRef.current) {
        markExhausted(id)
        return
      }
      update(id, { stage: "uploading", uploadRatio: 0 })
      try {
        const upload = await uploadImage(file, {
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
            })
            return
          }
          if (task.status === "failed") {
            applyQuota(quota)
            update(id, { stage: "failed", queuePosition: null, error: task.error_msg || "压缩失败" })
            return
          }
          update(id, {
            stage: task.status === "processing" ? "processing" : "queued",
            queuePosition: task.queue_position,
          })
        }
        update(id, { stage: "failed", queuePosition: null, error: POLL_TIMEOUT_ERROR })
      } catch (error) {
        if (isApiError(error) && error.code === ErrorCode.quotaExhausted) {
          markExhausted(id)
          return
        }
        if (isApiError(error) && error.code === ErrorCode.fileTooLarge) {
          update(id, { stage: "failed", queuePosition: null, error: FILE_TOO_LARGE_ERROR })
          return
        }
        update(id, { stage: "failed", queuePosition: null, error: errorMessage(error, "网络错误") })
      }
    },
    [applyQuota, markExhausted, update],
  )

  const addFiles = useCallback(
    (files: File[]) => {
      const validation = validateFiles(files, maxFileSize)
      setRejected(validation.rejected)
      setBatchNotice(validation.truncated ? TRUNCATED_NOTICE : null)
      if (validation.accepted.length === 0) return
      if (exhaustedRef.current || remaining === 0) {
        setQuotaExhausted(true)
        return
      }
      const fresh = validation.accepted.map((file): CompressionItem => ({
        id: crypto.randomUUID(),
        name: file.name,
        format: detectFormat(file.name, file.type) ?? "PNG",
        originalSize: file.size,
        stage: "waiting",
        uploadRatio: 0,
        queuePosition: null,
        compressedSize: null,
        compressedUrl: null,
        error: null,
      }))
      setItems((current) => [...current, ...fresh])
      fresh.forEach((item, index) => {
        const file = validation.accepted[index]
        if (file) void queueRef.current.enqueue(() => processFile(item.id, file))
      })
    },
    [maxFileSize, processFile, remaining],
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
    setDownloading,
    addFiles,
    dismissNotices,
  }
}
