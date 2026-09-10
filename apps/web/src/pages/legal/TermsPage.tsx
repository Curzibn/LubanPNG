import { LegalPage } from "./LegalPage.tsx"

const paragraphs = [
  "LubanPNG 是一个图片压缩预览服务：接收 PNG、JPEG、GIF、WebP、AVIF 图片，返回体积更小的压缩产物；静态图可按需转换为 WebP、AVIF、PNG 或 JPEG。",
  "上传的原图与压缩产物只做临时存储，超过保留期后自动删除；免费套餐的保留期为 24 小时。",
  "额度按套餐计算：未登录每天 5 次，注册用户每月 50 次，网页、API、CLI 共用一份次数，压缩失败不计次；格式转换在压缩之外额外计 1 次。",
  "本服务处于预览阶段，按现状提供，不对可用性、保留时长或压缩结果作任何保证。",
]

export const TermsPage = () => <LegalPage eyebrow="LEGAL" title="服务条款" paragraphs={paragraphs} />
