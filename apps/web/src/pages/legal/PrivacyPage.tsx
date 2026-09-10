import { LegalPage } from "./LegalPage.tsx"

const paragraphs = [
  "邮箱只用于发送登录验证码和标识账号，不用于营销，也不会提供给第三方。",
  "上传的原图与压缩产物临时保存在对象存储中，超过保留期（免费套餐 24 小时）自动删除，不会用于其他用途。",
  "API Key 仅以散列形式保存，创建后无法再次查看完整内容；吊销后立即失效。",
  "为了统计额度，服务会记录任务时间、文件名与体积；服务不会分析或识别图片内容。",
  "网站用匿名设备标识和登录账号统计访问：记录页面路径、来源域名、UTM 渠道参数，以及 IP、User-Agent 等技术信息，只用于产品分析（访问量、来源与转化），不用于广告投放。访问分析数据保留 180 天。",
]

export const PrivacyPage = () => <LegalPage eyebrow="LEGAL" title="隐私政策" paragraphs={paragraphs} />
