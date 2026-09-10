import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
  createApiKey,
  errorMessage,
  listApiKeys,
  revokeApiKey,
  type ApiKey,
  type CreatedApiKey,
  type Plan,
} from "../../api/client.ts"
import { Button } from "../../components/Button.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"
import { CopyIcon, PlusIcon } from "../../components/icons.tsx"
import { Notice } from "../../components/Notice.tsx"
import { Table, Td, Th } from "../../components/Table.tsx"
import { TextField } from "../../components/TextField.tsx"
import { formatIsoRelative, formatShortDate, maskedKey } from "../../lib/format.ts"

const DEFAULT_KEY_NAME = "本机 CLI"

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const CreatedKeyPanel = ({ created }: { created: CreatedApiKey }) => {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-2 rounded-control border-frame border-vermilion bg-vermilion-soft p-4">
      <p className="text-label font-medium text-ink">「{created.name}」已创建。Key 只显示这一次，请立即复制保存。</p>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <code className="min-w-0 flex-1 break-all font-mono text-ui text-ink">{created.key}</code>
        <Button
          variant="outline"
          size="xs"
          onClick={async () => {
            setCopied(await copyToClipboard(created.key))
          }}
        >
          <CopyIcon className="size-3.5" />
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
    </div>
  )
}

export const ApiKeysCard = ({ plan }: { plan: Plan }) => {
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState(DEFAULT_KEY_NAME)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setKeys(await listApiKeys())
      setError(null)
    } catch (loadError) {
      setError(errorMessage(loadError, "读取 API Key 失败"))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const atLimit = keys !== null && keys.length >= plan.max_api_keys

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === "") return
    setSubmitting(true)
    try {
      const key = await createApiKey(trimmed)
      setCreated(key)
      setCreating(false)
      setName(DEFAULT_KEY_NAME)
      await load()
    } catch (createError) {
      setError(errorMessage(createError, "创建失败"))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async (key: ApiKey) => {
    if (!window.confirm(`吊销「${key.name}」后，使用它的请求会立即失效。确定吊销？`)) return
    setRevoking(key.id)
    try {
      await revokeApiKey(key.id)
      if (created?.id === key.id) setCreated(null)
      await load()
    } catch (revokeError) {
      setError(errorMessage(revokeError, "吊销失败"))
    } finally {
      setRevoking(null)
    }
  }

  return (
    <section aria-label="API Key" className="flex flex-col gap-4.5 rounded-card border-thin border-hairline bg-surface p-5 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>API KEY</Eyebrow>
        <Button variant="ink" size="xs" onClick={() => setCreating(true)} disabled={creating || atLimit || keys === null}>
          <PlusIcon className="size-3.5" />
          新建 Key
        </Button>
      </div>
      {error && (
        <Notice tone="error" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}
      {creating && (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-control border-thin border-hairline bg-panel p-4 md:flex-row md:items-end">
          <TextField
            id="api-key-name"
            label="名称"
            value={name}
            maxLength={40}
            autoFocus
            required
            onChange={(event) => setName(event.target.value)}
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="ink" size="xl" disabled={submitting || name.trim() === ""}>
              {submitting ? "创建中…" : "创建"}
            </Button>
            <Button variant="outline" size="xl" onClick={() => setCreating(false)} disabled={submitting}>
              取消
            </Button>
          </div>
        </form>
      )}
      {created && <CreatedKeyPanel created={created} />}
      <Table label="API Key 列表">
        <thead>
          <tr>
            <Th>名称</Th>
            <Th>Key</Th>
            <Th>创建</Th>
            <Th>最近使用</Th>
            <Th>
              <span className="sr-only">操作</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {keys === null && !error && (
            <tr>
              <Td colSpan={5} className="text-ink-secondary">
                加载中…
              </Td>
            </tr>
          )}
          {keys !== null && keys.length === 0 && (
            <tr>
              <Td colSpan={5} className="text-ink-secondary">
                还没有 Key。新建一个，就能在 CLI 和 API 里使用同一份额度。
              </Td>
            </tr>
          )}
          {keys?.map((key) => (
            <tr key={key.id}>
              <Td className="whitespace-nowrap">{key.name}</Td>
              <Td className="whitespace-nowrap font-mono text-ink-secondary">{maskedKey(key.prefix, key.suffix)}</Td>
              <Td className="whitespace-nowrap font-mono text-ink-secondary">{formatShortDate(key.created_at)}</Td>
              <Td className="whitespace-nowrap font-mono text-ink-secondary">
                {key.last_used_at ? formatIsoRelative(key.last_used_at) : "从未"}
              </Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => void handleRevoke(key)}
                  disabled={revoking === key.id}
                  className="text-vermilion transition-colors hover:text-vermilion-hover disabled:opacity-disabled"
                >
                  {revoking === key.id ? "吊销中…" : "吊销"}
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="flex flex-col gap-1.5 text-label leading-relaxed text-ink-secondary">
        <p>
          Key 只在创建时完整显示一次，之后只能看到前后几位。{plan.name}可用 {plan.max_api_keys} 个 Key，Pro 可到 5 个。
        </p>
        <p>
          在终端登录：<span className="font-mono text-ink">lubanpng login</span>
        </p>
      </div>
    </section>
  )
}
