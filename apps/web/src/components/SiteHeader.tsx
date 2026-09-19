import { useEffect, useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router"
import { useI18n } from "../i18n/I18nProvider.tsx"
import { localizedPath, stripLocalePrefix } from "../i18n/locale.ts"
import { cx } from "../lib/cx.ts"
import { useSession } from "../session/sessionContext.ts"
import { BrandLink } from "./BrandMark.tsx"
import { LinkButton } from "./Button.tsx"
import { CloseIcon, MenuIcon } from "./icons.tsx"
import { LanguageSwitcher } from "./LanguageSwitcher.tsx"

const navItems = [
  { labelKey: "header.nav.pricing", to: "/pricing" },
  { labelKey: "header.nav.developers", to: "/developers" },
  { labelKey: "header.nav.cli", to: "/developers#cli" },
] as const

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  cx("transition-colors hover:text-vermilion", isActive ? "text-vermilion" : "text-ink")

const mobileLinkClass = "flex min-h-control items-center px-5 text-body font-medium text-ink"

const initialOf = (email: string): string => email.trim().charAt(0).toUpperCase() || "?"

const AccountChip = ({ email }: { email: string }) => {
  const { locale } = useI18n()
  return (
    <Link
      to={localizedPath("/dashboard", locale)}
      className="flex items-center gap-2 rounded-pill border-thin border-hairline py-1.75 pl-2 pr-3 text-ui font-regular text-ink transition-colors hover:border-ink"
    >
      <span className="flex size-6 items-center justify-center rounded-pill bg-ink text-label-sm text-paper">
        {initialOf(email)}
      </span>
      <span className="max-w-card truncate">{email}</span>
    </Link>
  )
}

export const SiteHeader = () => {
  const { locale, t } = useI18n()
  const { me, signedIn, signOut } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const onLoginPage = stripLocalePrefix(location.pathname) === "/login"

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, location.hash])

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      navigate(localizedPath("/", locale))
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
        {t("header.signOut")}
      </button>
    </div>
  ) : onLoginPage ? null : (
    <LinkButton to={localizedPath("/login", locale)} variant="outline" size="sm">
      {t("header.signIn")}
    </LinkButton>
  )

  return (
    <header className="relative z-header border-b-thin border-hairline bg-paper">
      <div className="px-5 md:px-10">
        <div className="mx-auto flex h-15 w-full max-w-page items-center justify-between md:h-18">
          <BrandLink />
          <nav aria-label={t("header.nav.aria")} className="hidden items-center gap-9 text-body font-medium md:flex">
            {navItems.map((item) => {
              const to = localizedPath(item.to, locale)
              return item.to.includes("#") ? (
                <Link key={item.to} to={to} className={desktopLinkClass({ isActive: false })}>
                  {t(item.labelKey)}
                </Link>
              ) : (
                <NavLink key={item.to} to={to} className={desktopLinkClass}>
                  {t(item.labelKey)}
                </NavLink>
              )
            })}
            {authSlot}
            <LanguageSwitcher />
          </nav>
          <button
            type="button"
            aria-label={menuOpen ? t("header.menu.close") : t("header.menu.open")}
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
          aria-label={t("header.nav.aria")}
          className="absolute inset-x-0 top-full z-menu flex flex-col border-b-thin border-hairline bg-paper py-2 shadow-menu md:hidden"
        >
          {navItems.map((item) => (
            <Link key={item.to} to={localizedPath(item.to, locale)} className={mobileLinkClass}>
              {t(item.labelKey)}
            </Link>
          ))}
          <div className="px-5 py-1.5">
            <LanguageSwitcher />
          </div>
          {signedIn && me?.email ? (
            <>
              <Link to={localizedPath("/dashboard", locale)} className={mobileLinkClass}>
                {t("header.dashboardWithEmail", { email: me.email })}
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className={cx(mobileLinkClass, "text-ink-secondary")}
              >
                {t("header.signOut")}
              </button>
            </>
          ) : (
            <Link to={localizedPath("/login", locale)} className={cx(mobileLinkClass, "text-vermilion")}>
              {t("header.signIn")}
            </Link>
          )}
        </nav>
      )}
    </header>
  )
}
