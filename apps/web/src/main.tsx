import faviconUrl from "@lubanpng/design-tokens/favicon.svg"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app/App.tsx"
import "./index.css"

const installFavicon = (href: string) => {
  const link = document.createElement("link")
  link.rel = "icon"
  link.type = "image/svg+xml"
  link.href = href
  document.head.append(link)
}

installFavicon(faviconUrl)

const root = document.getElementById("root")
if (!root) throw new Error("缺少 #root 容器")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
