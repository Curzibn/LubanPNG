# LubanPNG（鲁班刨）

**Shave image weight. Keep it sharp.** / 把图片刨薄，不伤画质。

[English](#english) · [中文](#中文)

TinyPNG-style image compression for PNG / JPEG / GIF / WebP / AVIF. Static images can convert formats, animations stay animated. Web, API and CLI share one quota.

- Web: https://lubanpng.wizthink.cn/?utm_source=github&utm_medium=readme&utm_campaign=launch
- CLI: `npm i -g lubanpng`
- API docs: https://lubanpng.wizthink.cn/developers?utm_source=github&utm_medium=readme&utm_campaign=launch

[![npm](https://img.shields.io/npm/v/lubanpng)](https://www.npmjs.com/package/lubanpng)
[![license](https://img.shields.io/github/license/Curzibn/LubanPNG)](LICENSE)
[![cli](https://img.shields.io/badge/CLI-npx%20lubanpng-blue)](packages/cli)

---

## English

Online image compression in the spirit of TinyPNG, built on palette quantization and re-encoding: PNG gets quantized then polished losslessly; JPEG has its source quality recovered first, so already-light images are never re-compressed; GIF / APNG / animated WebP are quantized frame by frame with animations intact; WebP and AVIF are re-encoded under an SSIM quality floor.

Each format takes its own path rather than being resampled blindly: JPEG source quality is recovered before re-encoding and low-quality sources are skipped, PNG is quantized to a palette before a lossless pass, and a run whose result is not smaller keeps the original and is not charged. Large wins land where the format allows them — screenshots, photos and transparent PNGs shrink most, while already-optimized files and most animations have little headroom and are left alone rather than re-encoded badly.

### Quota

| Plan | Quota | Per image | Output kept |
| --- | --- | --- | --- |
| Anonymous | 5 per day | 5 MB | 24 hours |
| Free account | 50 per month | 5 MB | 24 hours |

You are only charged when the output is actually smaller. Failed compressions are free, and so is a run whose result is not smaller than the original: without a conversion request the original file is kept, with one the converted artifact is still returned, and in both cases no run is charged. (On a run that does produce a smaller file, an explicit format conversion costs 1 extra run; converting to the same format stays at 1.)

### CLI

```bash
npm i -g lubanpng
```

Node 24+, on macOS / Linux / Windows.

```bash
lubanpng login                                     # paste an API key, verify and store it locally
lubanpng compress ./images --out ./dist            # compress files or directories
lubanpng compress ./images --recursive --in-place
lubanpng compress ./hero.png --convert webp        # convert format (1 extra run)
lubanpng usage                                     # plan, usage this period and reset time
```

Keys live in your user config directory (`~/.config/lubanpng` on macOS / Linux, `%APPDATA%\lubanpng` on Windows), or in the `LUBANPNG_API_KEY` environment variable. The API base can be overridden with `--api-base` or `LUBANPNG_API_BASE`. Run `lubanpng --help` for every flag.

HEIC: on macOS the CLI converts to JPEG with the system converter before uploading. Other platforms, and `--in-place`, fail with a clear error — export JPEG first. The web app converts iPhone HEIC selections in the browser. The API does not accept HEIC.

### API

Create an API key in the dashboard and send it in the `Authorization` header. Compression is asynchronous: upload to get a task id, poll (optionally waiting server-side for completion), then download the result.

```bash
curl -X POST https://lubanpng.wizthink.cn/v1/images/compress \
  -H "Authorization: Bearer lp_live_…" \
  -F "file=@photo.png"
```

```bash
curl "https://lubanpng.wizthink.cn/v1/images/compress/<task_id>?wait=30" \
  -H "Authorization: Bearer lp_live_…"
```

```bash
curl -o photo.min.jpg "https://lubanpng.wizthink.cn/v1/images/download/<task_id>.jpg"
```

Endpoints, error codes and the full OpenAPI reference: [developer docs](https://lubanpng.wizthink.cn/developers?utm_source=github&utm_medium=readme&utm_campaign=launch) and https://lubanpng.wizthink.cn/swagger-ui.

### Web

Open https://lubanpng.wizthink.cn/?utm_source=github&utm_medium=readme&utm_campaign=launch and drop images in. Up to 20 per batch, download one by one or as a zip.

### Project layout

A Cargo workspace plus a pnpm workspace in one monorepo:

- `apps/server`: Rust (axum) backend, compression pipeline and API
- `apps/web`: Vite + React single page app
- `packages/cli`: TypeScript command line, published as the npm package `lubanpng`
- `packages/design-tokens`: the single source for colour, type scale and spacing
- `deploy/`: k3s manifests

### Local development

```bash
cargo build
cargo test

pnpm install
pnpm test
pnpm build
```

Backend integration tests need a local PostgreSQL and MinIO; override the connection details with `TEST_DATABASE_URL` and `TEST_S3_*`.

### License

MIT

---

## 中文

TinyPNG 式在线图片压缩：支持 PNG、JPEG、GIF、WebP、AVIF，静态图可转换格式，动图保留动画。网页、API、CLI 共用一份额度。

- 在线使用：https://lubanpng.wizthink.cn/?utm_source=github&utm_medium=readme&utm_campaign=launch
- API 文档：https://lubanpng.wizthink.cn/developers?utm_source=github&utm_medium=readme&utm_campaign=launch

### 特性

- 按格式各走一套压缩策略：PNG 调色板量化 + 无损重编码；JPEG 先反推原图质量再决定下刀、SSIM 兜底；GIF / APNG / 动态 WebP 逐帧量化并保留动画；WebP 有损重编码 + SSIM 兜底；AVIF 用 AV1 重编码。
- 格式转换：静态图可转成 WebP / AVIF / PNG / JPEG；透明图转 JPEG 需指定背景色。
- 只对有效压缩计次：压缩失败不计，压完没变小也不计（未转换时保留原图；转换产物仍会返回但不计次）。
- 一个额度池三个入口：同一账号，网页、API、CLI 共用一份次数。
- HEIC / HEIF：iPhone Safari 选图会自动转成 JPEG 上传；CLI 在 macOS 上先转 JPEG 再上传；API 不接受 HEIC。

### 额度

| 套餐 | 额度 | 单张上限 | 产物保留 |
| --- | --- | --- | --- |
| 未登录 | 每天 5 次 | 5 MB | 24 小时 |
| 注册（免费） | 每月 50 次 | 5 MB | 24 小时 |

只有真正产出更小文件才计一次；格式转换在压缩之外额外计 1 次，目标格式与原格式相同时只计 1 次。

### 网页

打开 https://lubanpng.wizthink.cn/?utm_source=github&utm_medium=readme&utm_campaign=launch，拖入图片即可。最多 20 张，支持单张或打包下载。

### CLI

```bash
npm i -g lubanpng
```

Node 24+，macOS / Linux / Windows。

```bash
lubanpng login                                     # 粘贴 API Key，校验后保存到本机
lubanpng compress ./images --out ./dist            # 压缩文件或目录
lubanpng compress ./images --recursive --in-place
lubanpng compress ./hero.png --convert webp        # 转换格式（额外计 1 次）
lubanpng usage                                     # 查看套餐、本期用量与重置时间
```

Key 存在本机用户配置目录（macOS / Linux 为 `~/.config/lubanpng`，Windows 为 `%APPDATA%\lubanpng`），也可用环境变量 `LUBANPNG_API_KEY`。完整参数见 `lubanpng --help`。

### API

在工作台创建 API Key，放进 Authorization 头。压缩是异步任务：上传拿到任务号，查询时可让服务端等到完成再回，再下载产物。

```bash
curl -X POST https://lubanpng.wizthink.cn/v1/images/compress \
  -H "Authorization: Bearer lp_live_…" \
  -F "file=@photo.png"
```

```bash
curl "https://lubanpng.wizthink.cn/v1/images/compress/<task_id>?wait=30" \
  -H "Authorization: Bearer lp_live_…"
```

```bash
curl -o photo.min.jpg "https://lubanpng.wizthink.cn/v1/images/download/<task_id>.jpg"
```

端点、错误码与完整 OpenAPI 参考见 [开发者文档](https://lubanpng.wizthink.cn/developers?utm_source=github&utm_medium=readme&utm_campaign=launch) 与 https://lubanpng.wizthink.cn/swagger-ui。

### 项目结构

Cargo workspace + pnpm workspace 的 monorepo：

- `apps/server`：Rust（axum）后端，压缩管线与 API
- `apps/web`：Vite + React 单页应用
- `packages/cli`：TypeScript 命令行，发布为 npm 包 `lubanpng`
- `packages/design-tokens`：配色、字阶、间距等视觉唯一来源
- `deploy/`：k3s 部署清单

### 本地开发

```bash
cargo build
cargo test

pnpm install
pnpm test
pnpm build
```

后端集成测试需要本地 PostgreSQL 与 MinIO，可用 `TEST_DATABASE_URL`、`TEST_S3_*` 覆盖连接信息。

### License

MIT
