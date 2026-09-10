import { tokens } from "./tokens.ts"

type Declarations = Record<string, string>

const declarationLines = (prefix: string, values: Declarations): string[] =>
  Object.entries(values).map(([name, value]) => `  --${prefix}-${name}: ${value};`)

const textLines = (): string[] =>
  Object.entries(tokens.text).flatMap(([name, step]) => [
    `  --text-${name}: ${step.size};`,
    `  --text-${name}--line-height: ${step.lineHeight};`,
  ])

const borderSides: Record<string, string> = {
  "": "border-width",
  "t-": "border-top-width",
  "b-": "border-bottom-width",
  "l-": "border-left-width",
  "r-": "border-right-width",
}

const borderUtilities = (): string[] =>
  Object.keys(tokens.borderWidth).flatMap((name) =>
    Object.entries(borderSides).map(
      ([side, property]) => `@utility border-${side}${name} {\n  ${property}: var(--border-width-${name});\n}`,
    ),
  )

const singleValueUtilities = (
  utilityPrefix: string,
  variablePrefix: string,
  property: string,
  values: Declarations,
): string[] =>
  Object.keys(values).map(
    (name) => `@utility ${utilityPrefix}-${name} {\n  ${property}: var(--${variablePrefix}-${name});\n}`,
  )

export const renderTheme = (): string => {
  const theme = [
    "@theme static {",
    "  --*: initial;",
    `  --spacing: ${tokens.spacingUnit};`,
    ...declarationLines("breakpoint", tokens.breakpoint),
    ...declarationLines("color", tokens.color),
    ...declarationLines("font", tokens.font),
    "  --default-font-family: var(--font-body);",
    "  --default-mono-font-family: var(--font-mono);",
    ...textLines(),
    ...declarationLines("font-weight", tokens.fontWeight),
    ...declarationLines("tracking", tokens.tracking),
    ...declarationLines("leading", tokens.leading),
    ...declarationLines("radius", tokens.radius),
    ...declarationLines("container", tokens.container),
    ...declarationLines("spacing", tokens.controlHeight),
    ...declarationLines("border-width", tokens.borderWidth),
    ...declarationLines("shadow", tokens.shadow),
    ...declarationLines("opacity", tokens.opacity),
    ...declarationLines("z-index", tokens.zIndex),
    ...declarationLines("duration", tokens.duration),
    ...declarationLines("ease", tokens.ease),
    "  --default-transition-duration: var(--duration-base);",
    "  --default-transition-timing-function: var(--ease-standard);",
    "  --animate-pulse: pulse var(--duration-pulse) var(--ease-pulse) infinite;",
    "  @keyframes pulse {",
    "    50% {",
    "      opacity: var(--opacity-faint);",
    "    }",
    "  }",
    "}",
  ]
  const utilities = [
    ...borderUtilities(),
    ...singleValueUtilities("opacity", "opacity", "opacity", tokens.opacity),
    ...singleValueUtilities("z", "z-index", "z-index", tokens.zIndex),
    ...singleValueUtilities("duration", "duration", "transition-duration", tokens.duration),
  ]
  return [theme.join("\n"), ...utilities].join("\n\n") + "\n"
}

export const renderFavicon = (): string =>
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    `  <rect width="64" height="64" rx="10" fill="${tokens.color.vermilion}"/>`,
    `  <text x="32" y="46" text-anchor="middle" font-family="${tokens.font.display.replaceAll('"', "'")}" font-size="40" fill="${tokens.color.paper}">鲁</text>`,
    "</svg>",
    "",
  ].join("\n")
