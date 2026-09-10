import type { ReactNode } from "react"

export type IconProps = {
  className?: string
  label?: string
  strokeWidth?: number
}

type SvgProps = IconProps & { children: ReactNode; defaultStrokeWidth: number }

const Svg = ({ className, label, strokeWidth, defaultStrokeWidth, children }: SvgProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth ?? defaultStrokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    {children}
  </svg>
)

export const UploadTrayIcon = (props: IconProps) => (
  <Svg defaultStrokeWidth={1.5} {...props}>
    <path d="M12 3v11" />
    <path d="M8 10l4 4 4-4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Svg>
)

export const DownloadIcon = (props: IconProps) => (
  <Svg defaultStrokeWidth={1.8} {...props}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
)

export const CheckIcon = (props: IconProps) => (
  <Svg defaultStrokeWidth={2.2} {...props}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
)

export const PlusIcon = (props: IconProps) => (
  <Svg defaultStrokeWidth={2.2} {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
)

export const MenuIcon = (props: IconProps) => (
  <Svg defaultStrokeWidth={1.8} {...props}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </Svg>
)

export const CloseIcon = (props: IconProps) => (
  <Svg defaultStrokeWidth={1.8} {...props}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Svg>
)

export const ExternalLinkIcon = (props: IconProps) => (
  <Svg defaultStrokeWidth={2} {...props}>
    <path d="M7 17L17 7" />
    <path d="M9 7h8v8" />
  </Svg>
)

export const CopyIcon = (props: IconProps) => (
  <Svg defaultStrokeWidth={1.8} {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </Svg>
)
