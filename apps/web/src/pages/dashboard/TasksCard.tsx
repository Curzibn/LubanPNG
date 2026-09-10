import { useEffect, useState } from "react"
import { errorMessage, listTasks, type TaskRecord, type TaskSource, type TaskStatus } from "../../api/client.ts"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { Notice } from "../../components/Notice.tsx"
import { Table, Td, Th } from "../../components/Table.tsx"
import { cx } from "../../lib/cx.ts"
import { formatBytes, formatSavings, formatSizePair, formatUnixRelative, savingsPercent } from "../../lib/format.ts"

const sourceLabel: Record<TaskSource, string> = { web: "网页", api: "API", cli: "CLI" }

const statusDot: Record<TaskStatus, string> = {
  pending: "bg-amber",
  processing: "bg-amber",
  completed: "bg-jade",
  failed: "bg-vermilion",
}

const statusText = (task: TaskRecord): string => {
  switch (task.status) {
    case "completed":
      return "完成"
    case "failed":
      return task.error_msg ? `失败 · ${task.error_msg}` : "失败"
    case "processing":
      return "处理中"
    case "pending":
      return "排队中"
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
  if (task.downloadable && task.compressed_url) {
    return (
      <a href={task.compressed_url} download={task.original_name} className="text-ink transition-colors hover:text-vermilion">
        下载
      </a>
    )
  }
  if (task.status === "failed") return <span className="text-ink-secondary">未扣次</span>
  if (task.status === "completed") return <span className="text-ink-secondary">已过期</span>
  return null
}

export const TasksCard = ({ retentionHours }: { retentionHours: number }) => {
  const [tasks, setTasks] = useState<TaskRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listTasks()
      .then((list) => {
        if (!cancelled) setTasks(list)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError, "读取任务失败"))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section aria-label="最近任务" className="flex flex-col gap-4 rounded-card border-thin border-hairline bg-surface p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>最近任务</Eyebrow>
        <p className="text-label text-ink-secondary">产物 {retentionHours} 小时内可重新下载</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Table label="最近任务列表">
        <thead>
          <tr>
            <Th>时间</Th>
            <Th>文件</Th>
            <Th>体积</Th>
            <Th>节省</Th>
            <Th>来源</Th>
            <Th>状态</Th>
            <Th>
              <span className="sr-only">操作</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {tasks === null && !error && (
            <tr>
              <Td colSpan={7} className="text-ink-secondary">
                加载中…
              </Td>
            </tr>
          )}
          {tasks !== null && tasks.length === 0 && (
            <tr>
              <Td colSpan={7} className="text-ink-secondary">
                还没有任务。回到首页压缩第一张图。
              </Td>
            </tr>
          )}
          {tasks?.map((task) => {
            const savings =
              task.status === "completed" && task.compressed_size !== null
                ? formatSavings(savingsPercent(task.original_size, task.compressed_size))
                : null
            return (
              <tr key={task.task_id}>
                <Td className="whitespace-nowrap font-mono text-ink-secondary">{formatUnixRelative(task.created_at)}</Td>
                <Td className="max-w-sidebar truncate font-mono" title={task.original_name}>
                  {task.original_name}
                </Td>
                <Td className="whitespace-nowrap font-mono text-ink-secondary">
                  <SizeCell task={task} />
                </Td>
                <Td className={cx("whitespace-nowrap font-mono", savings ? "font-semibold text-jade" : "text-ink-secondary")}>
                  {savings ?? "—"}
                </Td>
                <Td className="whitespace-nowrap text-ink-secondary">{sourceLabel[task.source]}</Td>
                <Td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cx("size-2 rounded-pill", statusDot[task.status])} aria-hidden="true" />
                    {statusText(task)}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">
                  <ActionCell task={task} />
                </Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </section>
  )
}
