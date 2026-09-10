import { useEffect, useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router"
import { cx } from "../lib/cx.ts"
import { useSession } from "../session/sessionContext.ts"
import { BrandLink } from "./BrandMark.tsx"
import { LinkButton } from "./Button.tsx"
import { CloseIcon, MenuIcon } from "./icons.tsx"

const navItems = [
  { label: "定价", to: "/pricing" },
  { label: "开发者", to: "/developers" },
  { label: "CLI", to: "/developers#cli" },
] as const

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  cx("transition-colors hover:text-vermilion", isActive ? "text-vermilion" : "text-ink")

const mobileLinkClass = "flex min-h-control items-center px-5 text-body font-medium text-ink"

const initialOf = (email: string): string => email.trim().charAt(0).toUpperCase() || "?"

const AccountChip = ({ email }: { email: string }) => (
  <Link
    to="/dashboard"
    className="flex items-center gap-2 rounded-pill border-thin border-hairline py-1.75 pl-2 pr-3 text-ui font-regular text-ink transition-colors hover:border-ink"
  >
    <span className="flex size-6 items-center justify-center rounded-pill bg-ink text-label-sm text-paper">
      {initialOf(email)}
    </span>
    <span className="max-w-card truncate">{email}</span>
  </Link>
)

export const SiteHeader = () => {
  const { me, signedIn, signOut } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const onLoginPage = location.pathname === "/login"

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, location.hash])

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      navigate("/")
    } finally {
      setSigningOut(false)
    }
  }

  const authSlot = signedIn && me?.email ? (
    <div className="flex items-center gap-3">
      <AccountChip email={me.email} />
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="text-ui text-ink-secondary transition-colors hover:text-vermilion disabled:opacity-disabled"
      >
        退出
      </button>
    </div>
  ) : onLoginPage ? null : (
    <LinkButton to="/login" variant="outline" size="sm">
      登录
    </LinkButton>
  )

  return (
    <header className="relative z-header border-b-thin border-hairline bg-paper">
      <div className="px-5 md:px-10">
        <div className="mx-auto flex h-15 w-full max-w-page items-center justify-between md:h-18">
          <BrandLink />
          <nav aria-label="主导航" className="hidden items-center gap-9 text-body font-medium md:flex">
            {navItems.map((item) =>
              item.to.includes("#") ? (
                <Link key={item.to} to={item.to} className={desktopLinkClass({ isActive: false })}>
                  {item.label}
                </Link>
              ) : (
                <NavLink key={item.to} to={item.to} className={desktopLinkClass}>
                  {item.label}
                </NavLink>
              ),
            )}
            {authSlot}
          </nav>
          <button
            type="button"
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="-mr-2.5 flex size-11 items-center justify-center rounded-control text-ink md:hidden"
          >
            {menuOpen ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav
          id="mobile-menu"
          aria-label="主导航"
          className="absolute inset-x-0 top-full z-menu flex flex-col border-b-thin border-hairline bg-paper py-2 shadow-menu md:hidden"
        >
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={mobileLinkClass}>
              {item.label}
            </Link>
          ))}
          {signedIn && me?.email ? (
            <>
              <Link to="/dashboard" className={mobileLinkClass}>
                工作台 · {me.email}
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className={cx(mobileLinkClass, "text-ink-secondary")}
              >
                退出
              </button>
            </>
          ) : (
            <Link to="/login" className={cx(mobileLinkClass, "text-vermilion")}>
              登录
            </Link>
          )}
        </nav>
      )}
    </header>
  )
}
