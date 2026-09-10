import { Link } from "react-router"
import { BrandMark, Wordmark } from "./BrandMark.tsx"

export const GITHUB_URL = "https://github.com/Curzibn/LubanPNG"

const footerLinks = [
  { label: "定价", short: "定价", to: "/pricing" },
  { label: "开发者", short: "开发者", to: "/developers" },
  { label: "CLI", short: "CLI", to: "/developers#cli" },
  { label: "服务条款", short: "条款", to: "/terms" },
  { label: "隐私政策", short: "隐私", to: "/privacy" },
] as const

export const SiteFooter = () => (
  <footer className="mt-12 border-t-thin border-hairline md:mt-24">
    <div className="px-5 md:px-10">
      <div className="mx-auto flex w-full max-w-page flex-col-reverse gap-2.5 pb-8 pt-6 text-label text-ink-secondary md:flex-row md:items-center md:justify-between md:py-8 md:text-ui">
        <div className="flex items-center gap-2.5">
          <BrandMark size="footer" className="hidden md:inline-flex" />
          <Wordmark className="hidden md:inline" />
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-vermilion">
            开源于 GitHub · Curzibn/LubanPNG
          </a>
        </div>
        <nav aria-label="页脚导航" className="-ml-2 flex flex-wrap gap-1 md:ml-0 md:gap-7">
          {footerLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex min-h-control items-center px-2 transition-colors hover:text-vermilion md:min-h-0 md:px-0"
            >
              <span className="md:hidden">{link.short}</span>
              <span className="hidden md:inline">{link.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  </footer>
)
