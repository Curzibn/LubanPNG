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
    eyebrow: "PNG · JPEG · GIF · WebP · AVIF 在线压缩",
    headline: "把图片变小，免费。",
    lede: "照片和截图收益最大；没变小不计次数。",
    chips: ["网页", "API", "CLI"],
  },
  {
    file: "og-en.png",
    lang: "en",
    mark: "L",
    eyebrow: "PNG · JPEG · GIF · WebP · AVIF online compression",
    headline: "Make images smaller — free.",
    lede: "Photos and screenshots save the most; results that can't get smaller are never charged.",
    chips: ["Web", "API", "CLI"],
  },
]
