import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tokens } from "./tokens.ts"

const packageDir = dirname(fileURLToPath(import.meta.url))
const output = join(packageDir, "..", "..", "apps", "web", "public", "og.png")
const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

const { color, font, text, tracking, leading, radius, borderWidth, fontWeight, controlHeight } =
  tokens

const spacingUnit = Number.parseFloat(tokens.spacingUnit) * 16
const space = (units: number): string => `${units * spacingUnit}px`

const canvas = { width: 1200, height: 630 }

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Noto+Sans+SC:wght@400;500;700&family=ZCOOL+XiaoWei&display=swap" />
    <style>
      * { margin: 0; box-sizing: border-box; }
      body {
        width: ${canvas.width}px;
        height: ${canvas.height}px;
        background: ${color.paper};
        color: ${color.ink};
        font-family: ${font.body};
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: ${space(20)} ${space(20)};
        position: relative;
        overflow: hidden;
      }
      .rule {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: ${borderWidth.rule};
        background: ${color.vermilion};
      }
      .brand { display: flex; align-items: center; gap: ${space(4)}; }
      .mark {
        width: ${controlHeight["control-xl"]};
        height: ${controlHeight["control-xl"]};
        border-radius: ${radius.tile};
        background: ${color.vermilion};
        color: ${color.paper};
        font-family: ${font.display};
        font-size: ${text["display-sm"].size};
        line-height: ${leading.none};
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .wordmark {
        font-family: ${font.mono};
        font-weight: ${fontWeight.semibold};
        font-size: ${text["heading-sm"].size};
        line-height: ${leading.none};
        letter-spacing: ${tracking.tight};
      }
      .eyebrow {
        font-family: ${font.mono};
        font-size: ${text.label.size};
        line-height: ${leading.normal};
        letter-spacing: ${tracking.eyebrow};
        color: ${color.vermilion};
        font-weight: ${fontWeight.semibold};
      }
      h1 {
        font-family: ${font.display};
        font-size: ${text["display-hero"].size};
        line-height: ${leading.tight};
        letter-spacing: ${tracking.tight};
        margin-top: ${space(6)};
      }
      .lede {
        font-size: ${text.heading.size};
        line-height: ${leading.relaxed};
        color: ${color["ink-secondary"]};
        margin-top: ${space(6)};
      }
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: ${borderWidth.thin} solid ${color.hairline};
        padding-top: ${space(7)};
      }
      .chips { display: flex; gap: ${space(2.5)}; }
      .chip {
        font-family: ${font.mono};
        font-size: ${text["label-sm"].size};
        line-height: ${leading.normal};
        font-weight: ${fontWeight.semibold};
        color: ${color.vermilion};
        background: ${color["vermilion-soft"]};
        border-radius: ${radius.pill};
        padding: ${space(1.5)} ${space(3.5)};
      }
      .domain {
        font-family: ${font.mono};
        font-size: ${text["ui-lg"].size};
        line-height: ${leading.normal};
        color: ${color["ink-secondary"]};
      }
    </style>
  </head>
  <body>
    <div class="rule"></div>
    <div>
      <div class="brand">
        <span class="mark">鲁</span>
        <span class="wordmark">LubanPNG</span>
      </div>
      <div style="margin-top: ${space(16)}">
        <p class="eyebrow">PNG · JPEG · GIF · WebP · AVIF 智能压缩</p>
        <h1>把图片刨薄，不伤画质。</h1>
        <p class="lede">调色板量化与重编码把体积削掉一半以上，肉眼看不出差别。</p>
      </div>
    </div>
    <div class="footer">
      <div class="chips">
        <span class="chip">网页</span>
        <span class="chip">API</span>
        <span class="chip">CLI</span>
      </div>
      <span class="domain">lubanpng.wizthink.cn</span>
    </div>
  </body>
</html>
`

const workDir = mkdtempSync(join(tmpdir(), "lubanpng-og-"))
try {
  const page = join(workDir, "og.html")
  writeFileSync(page, html)
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${canvas.width},${canvas.height}`,
      "--virtual-time-budget=8000",
      `--screenshot=${output}`,
      `file://${page}`,
    ],
    { stdio: "inherit" },
  )
  process.stdout.write(`og image written to ${output}\n`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
