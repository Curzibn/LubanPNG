# lubanpng

LubanPNG 命令行图片压缩：把 PNG、JPEG、GIF、WebP、AVIF 刨薄，不伤画质。整个目录，一条命令。

与网页、API 共用同一账号的一份额度：未登录每天 5 次，注册后每月 50 次；只有真正产出更小文件才计一次，失败与没变小都不计。

在线使用与 API 文档：https://lubanpng.wizthink.cn

## 安装

```bash
npm i -g lubanpng
```

Node 24+，macOS / Linux / Windows。

## 使用

```bash
lubanpng login                                     # 粘贴 API Key，校验后保存到本机
lubanpng logout                                    # 清除本机保存的 Key
lubanpng compress ./images --out ./dist            # 压缩文件或目录
lubanpng compress ./images --recursive --in-place  # 递归并覆盖原文件
lubanpng compress ./hero.png --convert webp        # 转换格式（额外计 1 次）
lubanpng usage                                     # 查看套餐、本期用量与重置时间
```

`compress` 选项：

- `--out <dir>`：输出目录，保持输入目录结构
- `--in-place`：覆盖原文件
- `--recursive`：递归处理目录
- `--concurrency <n>`：并发数，默认 4，最大 16
- `--convert <fmt>`：转换输出格式，可选 `png`、`jpeg`、`webp`、`avif`（额外计 1 次）
- `--background <hex>`：透明图转 JPEG 时的背景色，如 `#ffffff`

Key 存在本机用户配置目录（macOS / Linux 为 `~/.config/lubanpng`，Windows 为 `%APPDATA%\lubanpng`），也可用环境变量 `LUBANPNG_API_KEY`；API 地址可用 `--api-base` 或 `LUBANPNG_API_BASE` 覆盖。

HEIC：macOS 上用系统转换器先转成 JPEG 再上传；其他平台与 `--in-place` 会报明确错误，请先自行导出 JPEG。

## 开发

```bash
pnpm install
pnpm --filter lubanpng build
pnpm --filter lubanpng test
```

## License

MIT
