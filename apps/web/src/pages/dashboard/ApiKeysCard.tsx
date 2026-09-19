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
import { useI18n } from "../../i18n/I18nProvider.tsx"
import { formatIsoRelative, formatShortDate, maskedKey } from "../../lib/format.ts"
import { planLabelKeys } from "./planLabels.ts"

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const CreatedKeyPanel = ({ created }: { created: CreatedApiKey }) => {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-2 rounded-control border-frame border-vermilion bg-vermilion-soft p-4">
      <p className="text-label font-medium text-ink">{t("keys.created", { name: created.name })}</p>
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
          {copied ? t("keys.copied") : t("keys.copy")}
        </Button>
      </div>
    </div>
  )
}

export const ApiKeysCard = ({ plan }: { plan: Plan }) => {
  const { locale, t } = useI18n()
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState(() => t("keys.defaultName"))
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setKeys(await listApiKeys())
      setError(null)
    } catch (loadError) {
      setError(errorMessage(loadError, t("keys.error.load")))
    }
  }, [t])

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
      setName(t("keys.defaultName"))
      await load()
    } catch (createError) {
      setError(errorMessage(createError, t("keys.error.create")))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async (key: ApiKey) => {
    if (!window.confirm(t("keys.revokeConfirm", { name: key.name }))) return
    setRevoking(key.id)
    try {
      await revokeApiKey(key.id)
      if (created?.id === key.id) setCreated(null)
      await load()
    } catch (revokeError) {
      setError(errorMessage(revokeError, t("keys.error.revoke")))
    } finally {
      setRevoking(null)
    }
  }

  return (
    <section aria-label={t("keys.aria")} className="flex flex-col gap-4.5 rounded-card border-thin border-hairline bg-surface p-5 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>API KEY</Eyebrow>
        <Button variant="ink" size="xs" onClick={() => setCreating(true)} disabled={creating || atLimit || keys === null}>
          <PlusIcon className="size-3.5" />
          {t("keys.new")}
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
            label={t("keys.name")}
            value={name}
            maxLength={40}
            autoFocus
            required
            onChange={(event) => setName(event.target.value)}
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="ink" size="xl" disabled={submitting || name.trim() === ""}>
              {submitting ? t("keys.creating") : t("keys.create")}
            </Button>
            <Button variant="outline" size="xl" onClick={() => setCreating(false)} disabled={submitting}>
              {t("keys.cancel")}
            </Button>
          </div>
        </form>
      )}
      {created && <CreatedKeyPanel created={created} />}
      <Table label={t("keys.tableAria")}>
        <thead>
          <tr>
            <Th>{t("keys.col.name")}</Th>
            <Th>{t("keys.col.key")}</Th>
            <Th>{t("keys.col.created")}</Th>
            <Th>{t("keys.col.lastUsed")}</Th>
            <Th>
              <span className="sr-only">{t("keys.col.actions")}</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {keys === null && !error && (
            <tr>
              <Td colSpan={5} className="text-ink-secondary">
                {t("keys.loading")}
              </Td>
            </tr>
          )}
          {keys !== null && keys.length === 0 && (
            <tr>
              <Td colSpan={5} className="text-ink-secondary">
                {t("keys.empty")}
              </Td>
            </tr>
          )}
          {keys?.map((key) => (
            <tr key={key.id}>
              <Td className="whitespace-nowrap">{key.name}</Td>
              <Td className="whitespace-nowrap font-mono text-ink-secondary">{maskedKey(key.prefix, key.suffix)}</Td>
              <Td className="whitespace-nowrap font-mono text-ink-secondary">{formatShortDate(key.created_at, locale)}</Td>
              <Td className="whitespace-nowrap font-mono text-ink-secondary">
                {key.last_used_at ? formatIsoRelative(key.last_used_at, locale) : t("keys.never")}
              </Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => void handleRevoke(key)}
                  disabled={revoking === key.id}
                  className="text-vermilion transition-colors hover:text-vermilion-hover disabled:opacity-disabled"
                >
                  {revoking === key.id ? t("keys.revoking") : t("keys.revoke")}
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="flex flex-col gap-1.5 text-label leading-relaxed text-ink-secondary">
        <p>
          {t("keys.note1", {
            plan: t(planLabelKeys[plan.id]),
            count: plan.max_api_keys,
          })}
        </p>
        <p>
          {t("keys.note2.prefix")} <span className="font-mono text-ink">lubanpng login</span> {t("keys.note2.suffix")}
        </p>
      </div>
    </section>
  )
}
