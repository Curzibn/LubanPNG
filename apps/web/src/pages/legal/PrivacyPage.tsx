import { LegalPage } from "./LegalPage.tsx"

const paragraphs = [
  "邮箱只用于发送登录验证码和标识账号，不用于营销，也不会提供给第三方。",
  "上传的原图与压缩产物临时保存在对象存储中，超过保留期（免费套餐 24 小时）自动删除，不会用于其他用途。",
  "API Key 仅以散列形式保存，创建后无法再次查看完整内容；吊销后立即失效。",
  "为了统计额度，服务会记录任务时间、文件名与体积；服务不会分析或识别图片内容。",
]

export const PrivacyPage = () => <LegalPage eyebrow="LEGAL" title="隐私政策" paragraphs={paragraphs} />
