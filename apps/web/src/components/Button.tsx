import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react"
import { Link } from "react-router"
import { cx } from "../lib/cx.ts"

export type ButtonVariant = "ink" | "accent" | "outline" | "outlineNight" | "ghost"
export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl" | "responsive"

const variantClass: Record<ButtonVariant, string> = {
  ink: "bg-ink text-paper hover:bg-night-code",
  accent: "bg-vermilion text-paper hover:bg-vermilion-hover",
  outline: "border-frame border-ink text-ink hover:bg-panel",
  outlineNight: "border-frame border-night-text text-night-text hover:bg-night-code",
  ghost: "text-ink hover:bg-panel",
}

const sizeClass: Record<ButtonSize, string> = {
  xs: "h-control-xs px-3.5 text-label",
  sm: "h-control-sm px-4.5 text-ui",
  md: "h-control px-4 text-ui",
  lg: "h-control-md px-5 text-body",
  xl: "h-control-lg px-5 text-body",
  responsive: "h-control px-4 text-label md:h-control-sm md:px-4.5 md:text-ui",
}

const baseClass =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium leading-none transition-colors disabled:pointer-events-none disabled:opacity-disabled"

export const buttonClass = (variant: ButtonVariant, size: ButtonSize, className?: string): string =>
  cx(baseClass, variantClass[variant], sizeClass[size], className)

type StyleProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}

export type ButtonProps = StyleProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">

export const Button = ({ variant = "ink", size = "sm", className, children, type = "button", ...rest }: ButtonProps) => (
  <button type={type} className={buttonClass(variant, size, className)} {...rest}>
    {children}
  </button>
)

export type RouteButtonProps = StyleProps & { to: string }

export const LinkButton = ({ variant = "ink", size = "sm", className, children, to }: RouteButtonProps) => (
  <Link to={to} className={buttonClass(variant, size, className)}>
    {children}
  </Link>
)

export type AnchorButtonProps = StyleProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & { href: string }

export const AnchorButton = ({ variant = "ink", size = "sm", className, children, href, ...rest }: AnchorButtonProps) => (
  <a href={href} className={buttonClass(variant, size, className)} {...rest}>
    {children}
  </a>
)
