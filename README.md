# LubanPNG（鲁班刨）

把图片刨薄，不伤画质。

TinyPNG 式在线图片压缩：支持 PNG、JPEG、GIF、WebP、AVIF，静态图可转换格式，动图保留动画。网页、API、CLI 共用一份额度。

在线使用：https://lubanpng.wizthink.cn · [定价](https://lubanpng.wizthink.cn/pricing) · [API 文档](https://lubanpng.wizthink.cn/developers)

TinyPNG-style image compression for web, API and CLI. Free to use: 5 compressions a day without an account, 50 a month after signing up.

## 特性

- 按格式各走一套压缩策略：PNG 调色板量化 + 无损重编码；JPEG 先反推原图质量再决定下刀、SSIM 兜底；GIF / APNG / 动态 WebP 逐帧量化并保留动画；WebP 有损重编码 + SSIM 兜底；AVIF 用 AV1 重编码。
- 格式转换：静态图可转成 WebP / AVIF / PNG / JPEG；透明图转 JPEG 需指定背景色。
- 只对有效压缩计次：压缩失败不计，压完没变小（保留原图）也不计。
- 一个额度池三个入口：同一账号，网页、API、CLI 共用一份次数。
- HEIC / HEIF：iPhone Safari 选图会自动转成 JPEG 上传；CLI 在 macOS 上先转 JPEG 再上传；API 不接受 HEIC。

## 额度

| 套餐 | 额度 | 单张上限 | 产物保留 |
| --- | --- | --- | --- |
| 未登录 | 每天 5 次 | 5 MB | 24 小时 |
| 注册（免费） | 每月 50 次 | 5 MB | 24 小时 |

只有真正产出更小文件才计一次；格式转换在压缩之外额外计 1 次，目标格式与原格式相同时只计 1 次。

## 网页

打开 https://lubanpng.wizthink.cn，拖入图片即可。最多 20 张，支持单张或打包下载。

## CLI

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

## API

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
curl -o photo.min.jpg "https://lubanpng.wizthink.cn/v1/images/download/compressed_<task_id>.jpg"
```

端点、错误码与完整 OpenAPI 参考见 [开发者文档](https://lubanpng.wizthink.cn/developers) 与 https://lubanpng.wizthink.cn/swagger-ui。

## 项目结构

Cargo workspace + pnpm workspace 的 monorepo：

- `apps/server`：Rust（axum）后端，压缩管线与 API
- `apps/web`：Vite + React 单页应用
- `packages/cli`：TypeScript 命令行，发布为 npm 包 `lubanpng`
- `packages/design-tokens`：配色、字阶、间距等视觉唯一来源
- `deploy/`：k3s 部署清单

## 本地开发

```bash
cargo build
cargo test

pnpm install
pnpm test
pnpm build
```

后端集成测试需要本地 PostgreSQL 与 MinIO，可用 `TEST_DATABASE_URL`、`TEST_S3_*` 覆盖连接信息。

## License

MIT
