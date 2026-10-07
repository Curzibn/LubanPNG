# lubanpng

Command line image compression for LubanPNG: shave PNG, JPEG, GIF, WebP and AVIF files down without hurting them. A whole directory in one command.

Web, API and CLI share one quota per account: 5 runs a day anonymously, 50 a month once you sign up. You are only charged when the output is actually smaller — failures and no-benefit runs are free.

Web app and API docs: https://lubanpng.wizthink.cn/?utm_source=npm&utm_medium=readme&utm_campaign=launch

## Install

```bash
npm i -g lubanpng
```

Node 24+, on macOS / Linux / Windows.

## Usage

```bash
lubanpng login                                     # paste an API key, verify and store it locally
lubanpng logout                                    # remove the stored key
lubanpng compress ./images --out ./dist            # compress files or directories
lubanpng compress ./images --recursive --in-place  # recurse and overwrite in place
lubanpng compress ./hero.png --convert webp        # convert format (1 extra run)
lubanpng usage                                     # plan, usage this period and reset time
```

`compress` options:

- `--out <dir>`: output directory, input structure preserved
- `--in-place`: overwrite the input files
- `--recursive`: walk directories
- `--concurrency <n>`: parallel uploads, default 4, max 16
- `--convert <fmt>`: output format, one of `png`, `jpeg`, `webp`, `avif` (1 extra run)
- `--background <hex>`: background colour when flattening a transparent image to JPEG, e.g. `#ffffff`

Keys live in your user config directory (`~/.config/lubanpng` on macOS / Linux, `%APPDATA%\lubanpng` on Windows), or in the `LUBANPNG_API_KEY` environment variable. The API base can be overridden with `--api-base` or `LUBANPNG_API_BASE`.

HEIC: on macOS the CLI converts to JPEG with the system converter before uploading. Other platforms, and `--in-place`, fail with a clear error — export JPEG first.

## Example run

```bash
$ lubanpng login
  Paste your API key: lp_live_…
  Signed in as zibin@example.com · 46 runs left this month

$ lubanpng compress ./images --out ./dist --recursive
  photo_banner.jpg   2.40 MB → 0.89 MB   -63%
  logo@2x.png         312 KB →   96 KB   -69%
  sticker_wave.gif   1.10 MB → 0.71 MB   -36%
  3 images, saved 2.11 MB, 43 runs left this month

$ lubanpng compress ./hero.png --convert webp
  hero.png           1.20 MB → 0.31 MB   -74%   → hero.webp
  1 image, saved 0.89 MB, 41 runs left this month, 1 converted

$ lubanpng usage
  Free plan · used 7 / 50 this month · resets Oct 1
```

## REST API

The CLI speaks the same API — three requests wire it into any language or pipeline:

```bash
# 1. Upload and queue a compression
curl -X POST https://lubanpng.wizthink.cn/v1/images/compress \
  -H "Authorization: Bearer lp_live_…" \
  -F "file=@photo.png"
# → { "code": 0, "data": { "task_id": "550e8400-…" } }

# 2. Poll the result — wait holds the request for up to 30 seconds
curl "https://lubanpng.wizthink.cn/v1/images/compress/550e8400-…?wait=30" \
  -H "Authorization: Bearer lp_live_…"

# 3. Download the compressed file
curl -o photo.min.jpg "https://lubanpng.wizthink.cn/v1/images/download/550e8400-….jpg"
```

Create an API key in the dashboard: https://lubanpng.wizthink.cn/dashboard — full reference: https://lubanpng.wizthink.cn/developers

## Development

```bash
pnpm install
pnpm --filter lubanpng build
pnpm --filter lubanpng test
```

## License

MIT
