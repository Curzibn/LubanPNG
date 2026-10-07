import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SITE_ORIGIN = "https://lubanpng.wizthink.cn"
const ENDPOINT = "https://api.indexnow.org/indexnow"
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "public")

const keyFiles = readdirSync(publicDir).filter((name) => /^[a-f0-9]{8,128}\.txt$/.test(name))
if (keyFiles.length !== 1) {
  console.error(`expected exactly one IndexNow key file in ${publicDir}, found ${keyFiles.length}`)
  process.exit(1)
}
const keyFile = keyFiles[0]
const key = keyFile.replace(/\.txt$/, "")
if (readFileSync(join(publicDir, keyFile), "utf8").trim() !== key) {
  console.error(`IndexNow key file ${keyFile} does not contain its own name`)
  process.exit(1)
}

const explicit = process.argv.slice(2)
const sitemap = readFileSync(join(publicDir, "sitemap.xml"), "utf8")
const urls = explicit.length > 0 ? explicit : Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1])
if (urls.length === 0) {
  console.error("no URLs to submit")
  process.exit(1)
}

const keyLocation = `${SITE_ORIGIN}/${keyFile}`
const keyResponse = await fetch(keyLocation)
if (!keyResponse.ok || (await keyResponse.text()).trim() !== key) {
  console.error(`key file is not live yet at ${keyLocation} (status ${keyResponse.status}); deploy first`)
  process.exit(1)
}

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE_ORIGIN).host, key, keyLocation, urlList: urls }),
})
console.log(`IndexNow ${response.status} ${response.statusText} · keyLocation ${keyLocation} · ${urls.length} URL(s)`)
console.log(urls.join("\n"))
if (response.status !== 200 && response.status !== 202) process.exit(1)
