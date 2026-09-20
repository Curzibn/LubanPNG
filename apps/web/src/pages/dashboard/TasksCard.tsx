import { useEffect, useState } from "react"
import { errorMessage, listTasks, type TaskRecord, type TaskSource, type TaskStatus } from "../../api/client.ts"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { Notice } from "../../components/Notice.tsx"
import { Table, Td, Th } from "../../components/Table.tsx"
import { useI18n } from "../../i18n/I18nProvider.tsx"
import type { MessageKey } from "../../i18n/messages.ts"
import { cx } from "../../lib/cx.ts"
import {
  formatBytes,
  formatSavings,
  formatSizePair,
  formatUnixRelative,
  outputFileName,
  savingsPercent,
} from "../../lib/format.ts"

const sourceLabelKeys: Record<TaskSource, MessageKey> = { web: "tasks.source.web", api: "tasks.source.api", cli: "tasks.source.cli" }

const statusDot = (task: TaskRecord): string => {
  if (task.status === "completed" && task.no_gain) return "bg-ink-secondary"
  return statusDotByStatus[task.status]
}

const statusDotByStatus: Record<TaskStatus, string> = {
  pending: "bg-amber",
  processing: "bg-amber",
  completed: "bg-jade",
  failed: "bg-vermilion",
}

const statusText = (task: TaskRecord, t: (key: MessageKey, params?: Record<string, string | number>) => string): string => {
  switch (task.status) {
    case "completed":
      return task.no_gain ? `${t("tasks.status.done")} · ${t("tasks.noGain")}` : t("tasks.status.done")
    case "failed":
      return task.error_msg ? `${t("tasks.status.failed")} · ${task.error_msg}` : t("tasks.status.failed")
    case "processing":
      return t("tasks.status.processing")
    case "pending":
      return t("tasks.status.pending")
  }
}

const SizeCell = ({ task }: { task: TaskRecord }) => {
  if (task.compressed_size === null) return <>{formatBytes(task.original_size)}</>
  const pair = formatSizePair(task.original_size, task.compressed_size)
  return (
    <>
      {pair.original} → {pair.compressed}
    </>
  )
}

const ActionCell = ({ task }: { task: TaskRecord }) => {
  const { t } = useI18n()
  if (task.downloadable && task.compressed_url) {
    return (
      <a
        href={task.compressed_url}
        download={outputFileName(task.original_name, task.output_format)}
        className="text-ink transition-colors hover:text-vermilion"
      >
        {t("tasks.download")}
      </a>
    )
  }
  if (task.status === "failed") return <span className="text-ink-secondary">{t("tasks.free")}</span>
  if (task.status === "completed") return <span className="text-ink-secondary">{t("tasks.expired")}</span>
  return null
}

export const TaskRow = ({ task }: { task: TaskRecord }) => {
  const { locale, t } = useI18n()
  const savings =
    task.kind === "compress" && task.status === "completed" && task.compressed_size !== null && !task.no_gain
      ? formatSavings(savingsPercent(task.original_size, task.compressed_size))
      : null
  const scale = task.kind === "upscale" && task.status === "completed" ? task.scale : null
  return (
    <tr>
      <Td className="whitespace-nowrap font-mono text-ink-secondary">{formatUnixRelative(task.created_at, locale)}</Td>
      <Td className="max-w-sidebar truncate font-mono" title={task.original_name}>
        {task.original_name}
        {task.target_format && (
          <span className="ml-2 rounded-mark bg-panel px-1.5 py-0.5 text-label-2xs font-semibold text-ink-secondary">
            → {task.target_format.toUpperCase()}
          </span>
        )}
      </Td>
      <Td className="whitespace-nowrap font-mono text-ink-secondary">
        <SizeCell task={task} />
      </Td>
      <Td className={cx("whitespace-nowrap font-mono", savings ? "font-semibold text-jade" : "text-ink-secondary")}>
        {scale !== null ? (
          <span className="rounded-mark bg-panel px-1.5 py-0.5 text-label-2xs font-semibold text-ink-secondary">
            ×{scale === "x2" ? 2 : 4}
          </span>
        ) : (
          (savings ?? "—")
        )}
      </Td>
      <Td className="whitespace-nowrap text-ink-secondary">{t(sourceLabelKeys[task.source])}</Td>
      <Td className="whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span className={cx("size-2 rounded-pill", statusDot(task))} aria-hidden="true" />
          {statusText(task, t)}
        </span>
      </Td>
      <Td className="whitespace-nowrap">
        <ActionCell task={task} />
      </Td>
    </tr>
  )
}

export const TasksCard = ({ retentionHours }: { retentionHours: number }) => {
  const { t } = useI18n()
  const [tasks, setTasks] = useState<TaskRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listTasks()
      .then((list) => {
        if (!cancelled) setTasks(list)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError, t("tasks.error.load")))
      })
    return () => {
      cancelled = true
    }
  }, [t])

  return (
    <section aria-label={t("tasks.aria")} className="flex flex-col gap-4 rounded-card border-thin border-hairline bg-surface p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>{t("tasks.title")}</Eyebrow>
        <p className="text-label text-ink-secondary">{t("tasks.retention", { hours: retentionHours })}</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Table label={t("tasks.tableAria")}>
        <thead>
          <tr>
            <Th>{t("tasks.col.time")}</Th>
            <Th>{t("tasks.col.file")}</Th>
            <Th>{t("tasks.col.size")}</Th>
            <Th>{t("tasks.col.savings")}</Th>
            <Th>{t("tasks.col.source")}</Th>
            <Th>{t("tasks.col.status")}</Th>
            <Th>
              <span className="sr-only">{t("tasks.col.actions")}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {tasks === null && !error && (
            <tr>
              <Td colSpan={7} className="text-ink-secondary">
                {t("tasks.loading")}
              </Td>
            </tr>
          )}
          {tasks !== null && tasks.length === 0 && (
            <tr>
              <Td colSpan={7} className="text-ink-secondary">
                {t("tasks.empty")}
              </Td>
            </tr>
          )}
          {tasks?.map((task) => (
            <TaskRow key={task.task_id} task={task} />
          ))}
        </tbody>
      </Table>
    </section>
  )
}
