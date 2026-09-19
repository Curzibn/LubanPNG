import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app/App.tsx"
import { applyInitialRedirect } from "./i18n/locale.ts"
import "./index.css"

applyInitialRedirect()

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root container")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
