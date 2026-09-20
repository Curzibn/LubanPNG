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

## Development

```bash
pnpm install
pnpm --filter lubanpng build
pnpm --filter lubanpng test
```

## License

MIT
