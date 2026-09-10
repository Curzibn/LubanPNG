import JSZip from "jszip"

export type DownloadItem = { name: string; url: string }

export type ZipDelivery = "zip" | "links"

export type ZipDependencies = {
  fetchBlob: (url: string) => Promise<Blob>
  saveBlob: (blob: Blob, fileName: string) => void
  openLink: (url: string) => void
}

const splitName = (name: string): { stem: string; extension: string } => {
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return { stem: name, extension: "" }
  return { stem: name.slice(0, dot), extension: name.slice(dot) }
}

export const uniqueNames = (names: string[]): string[] => {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count === 0) return name
    const { stem, extension } = splitName(name)
    return `${stem} (${count + 1})${extension}`
  })
}

export const zipFileName = (now: Date = new Date()): string => {
  const stamp = now.toISOString().slice(0, 19).replaceAll(/[-:T]/g, "")
  return `lubanpng-${stamp}.zip`
}

export const downloadAllAsZip = async (items: DownloadItem[], deps: ZipDependencies): Promise<ZipDelivery> => {
  if (items.length === 0) return "zip"
  const names = uniqueNames(items.map((item) => item.name))
  try {
    const blobs = await Promise.all(items.map((item) => deps.fetchBlob(item.url)))
    const zip = new JSZip()
    blobs.forEach((blob, index) => {
      zip.file(names[index] ?? `image-${index + 1}`, blob)
    })
    const archive = await zip.generateAsync({ type: "blob" })
    deps.saveBlob(archive, zipFileName())
    return "zip"
  } catch {
    items.forEach((item) => deps.openLink(item.url))
    return "links"
  }
}

export const saveBlobInBrowser = (blob: Blob, fileName: string): void => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export const openLinkInBrowser = (url: string): void => {
  window.open(url, "_blank", "noopener")
}
