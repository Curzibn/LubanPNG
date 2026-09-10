import { usePageTitle } from "../app/usePageTitle.ts"
import { LinkButton } from "../components/Button.tsx"
import { Container } from "../components/Container.tsx"
import { Eyebrow } from "../components/Eyebrow.tsx"

export const NotFoundPage = () => {
  usePageTitle("页面不存在")
  return (
    <Container className="pt-16 md:pt-24">
      <div className="flex flex-col items-start gap-4">
        <Eyebrow>404</Eyebrow>
        <h1 className="font-display text-display-sm text-ink md:text-display-md">这一页不在刨床上</h1>
        <p className="text-body text-ink-secondary">地址可能写错了，或者页面已经移走。</p>
        <LinkButton to="/" variant="outline" size="sm" className="mt-2">
          回到首页
        </LinkButton>
      </div>
    </Container>
  )
}
