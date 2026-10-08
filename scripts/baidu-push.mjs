const SITE_ORIGIN = "https://lubanpng.wizthink.cn"
const ENDPOINT = "http://data.zz.baidu.com/urls"

const token = process.env.BAIDU_PUSH_TOKEN
if (!token) {
  console.error("BAIDU_PUSH_TOKEN is not set — fetch the deepblue credential 'baidu-push-token' and export it first")
  process.exit(1)
}

const urls = process.argv.slice(2)
if (urls.length === 0) {
  console.error("usage: pnpm baidu-push <url> [url...] — push only changed URLs; the daily quota is ~10 and shared with manual submissions")
  process.exit(1)
}

const endpoint = `${ENDPOINT}?site=${encodeURIComponent(SITE_ORIGIN)}&token=${encodeURIComponent(token)}`
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: urls.join("\n"),
})
const body = await response.text()
console.log(`Baidu push ${response.status} · ${urls.length} URL(s)`)
console.log(body)
if (!response.ok || body.includes('"error"')) process.exit(1)
