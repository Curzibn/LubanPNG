import { usePageTitle } from "../../app/usePageTitle.ts"
import { Container } from "../../components/Container.tsx"
import { Eyebrow } from "../../components/Eyebrow.tsx"

export const LegalPage = ({ eyebrow, title, paragraphs }: { eyebrow: string; title: string; paragraphs: string[] }) => {
  usePageTitle(title)
  return (
    <Container className="pt-10 md:pt-18">
      <article className="mx-auto flex w-full max-w-lede flex-col gap-6">
        <header className="flex flex-col gap-3">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="font-display text-display-sm text-ink md:text-display-md">{title}</h1>
        </header>
        <ol className="flex flex-col gap-4 text-body text-ink">
          {paragraphs.map((paragraph, index) => (
            <li key={paragraph} className="flex gap-3.5">
              <span className="w-4.5 shrink-0 pt-0.5 font-mono text-label-sm text-ink-secondary">{index + 1}</span>
              <p>{paragraph}</p>
            </li>
          ))}
        </ol>
      </article>
    </Container>
  )
}
