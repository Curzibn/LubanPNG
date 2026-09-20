import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { Plugin } from "vite"
import { buildPageHead, type PageHead } from "./src/i18n/meta.ts"
import { buildShellArtifacts, renderShellDocument } from "./src/i18n/shells.ts"

const INDEX_HEAD: PageHead = buildPageHead("home", "zh-CN", "/")

export const shellOutputDir = "shells"

export const emitStaticShells = (outDir: string): string[] => {
  const artifacts = buildShellArtifacts(readFileSync(join(outDir, "index.html"), "utf8"))
  if (artifacts.length === 0) throw new Error("expected at least one static shell")
  return artifacts.map((artifact) => {
    const target = join(outDir, shellOutputDir, artifact.fileName)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, artifact.html)
    const written = readFileSync(target, "utf8")
    if (!written.includes("</head>") || !written.includes("<title>")) {
      throw new Error(`static shell ${artifact.fileName} was written incomplete`)
    }
    return target
  })
}

export const staticShells = (): Plugin => {
  let outDir = ""
  let isBuild = false
  return {
    name: "lubanpng-static-shells",
    configResolved(config) {
      isBuild = config.command === "build"
      outDir = resolve(config.root, config.build.outDir)
    },
    transformIndexHtml(html) {
      return renderShellDocument(html, INDEX_HEAD)
    },
    closeBundle() {
      if (isBuild) emitStaticShells(outDir)
    },
  }
}
