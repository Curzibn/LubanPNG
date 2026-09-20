import { API_BASE_ENV, DEFAULT_API_BASE, describeError } from "./api.js"
import { parseArgv } from "./args.js"
import { compressCommand } from "./commands/compress.js"
import { loginCommand } from "./commands/login.js"
import { logoutCommand } from "./commands/logout.js"
import { usageCommand } from "./commands/usage.js"
import type { Context } from "./context.js"
import { CancelledError, UsageError } from "./errors.js"
import { renderHelp } from "./help.js"
import { resolveLang, translator } from "./i18n/messages.js"
import { defaultIo, type Io } from "./io.js"
import { VERSION } from "./version.js"

export type RunOptions = {
  env?: NodeJS.ProcessEnv
  io?: Io
}

export const run = async (argv: string[], options: RunOptions = {}): Promise<number> => {
  const env = options.env ?? process.env
  const io = options.io ?? defaultIo
  const lang = resolveLang(argv, env)
  const t = translator(lang)

  try {
    const parsed = parseArgv(argv, lang)
    if (parsed.command === "help") {
      io.write(renderHelp(t))
      return 0
    }
    if (parsed.command === "version") {
      io.write(`${VERSION}\n`)
      return 0
    }

    const configured = parsed.apiBase ?? env[API_BASE_ENV]?.trim()
    const context: Context = {
      apiBase: configured && configured !== "" ? configured : DEFAULT_API_BASE,
      env,
      io,
      lang,
    }

    switch (parsed.command) {
      case "login":
        return await loginCommand(context)
      case "logout":
        return await logoutCommand(context)
      case "usage":
        return await usageCommand(context)
      case "compress":
        return await compressCommand(context, {
          paths: parsed.paths,
          out: parsed.out,
          inPlace: parsed.inPlace,
          recursive: parsed.recursive,
          concurrency: parsed.concurrency,
          convert: parsed.convert,
          background: parsed.background,
        })
    }
    return 1
  } catch (error) {
    if (error instanceof UsageError) {
      io.writeError(`${error.message}\n`)
      io.writeError(`${t("error.usageHint")}\n`)
      return error.exitCode
    }
    if (error instanceof CancelledError) {
      io.writeError(`${t("error.cancelled")}\n`)
      return 130
    }
    io.writeError(`${describeError(error, lang)}\n`)
    return 1
  }
}
