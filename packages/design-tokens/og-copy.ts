export type OgLocaleCopy = {
  file: string
  lang: string
  mark: string
  eyebrow: string
  headline: string
  lede: string
  chips: string[]
}

export const ogLocales: OgLocaleCopy[] = [
  {
    file: "og.png",
    lang: "zh-CN",
    mark: "鲁",
    eyebrow: "PNG · JPEG · GIF · WebP · AVIF 智能压缩",
    headline: "把图片刨薄，也能放大 2×、4×。",
    lede: "照片、截图与透明 PNG 收益最大；已经压过的图与多数动图空间有限，压不小不计次数。",
    chips: ["网页", "API", "CLI"],
  },
  {
    file: "og-en.png",
    lang: "en",
    mark: "L",
    eyebrow: "PNG · JPEG · GIF · WebP · AVIF smart compression",
    headline: "Shave image weight. Upscale 2× / 4×.",
    lede: "Photos, screenshots and transparent PNGs save the most; already-optimized files and most animations have little headroom and are never charged.",
    chips: ["Web", "API", "CLI"],
  },
]
