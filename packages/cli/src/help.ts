import { DEFAULT_API_BASE, API_BASE_ENV, USER_AGENT } from "./api.js"
import { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } from "./args.js"
import { API_KEY_ENV } from "./config.js"
import type { Translate } from "./i18n/messages.js"
import { VERSION } from "./version.js"

export const renderHelp = (t: Translate): string =>
  [
    t("help.title", { version: VERSION }),
    "",
    t("help.usage.heading"),
    t("help.usage.command"),
    "",
    t("help.commands.heading"),
    t("help.command.login"),
    t("help.command.logout"),
    t("help.command.compress"),
    t("help.command.usage"),
    "",
    t("help.global.heading"),
    t("help.option.apiBase", { default: DEFAULT_API_BASE }),
    t("help.option.lang"),
    t("help.option.help"),
    t("help.option.version"),
    "",
    t("help.compress.heading"),
    t("help.option.out"),
    t("help.option.inPlace"),
    t("help.option.recursive"),
    t("help.option.concurrency", { default: DEFAULT_CONCURRENCY, max: MAX_CONCURRENCY }),
    t("help.option.convert"),
    t("help.option.background"),
    "",
    t("help.env.heading"),
    t("help.env.apiKey", { env: API_KEY_ENV }),
    t("help.env.apiBase", { env: API_BASE_ENV }),
    "",
    t("help.userAgent", { agent: USER_AGENT }),
    "",
  ].join("\n")
