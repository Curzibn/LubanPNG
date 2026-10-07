import { type WaitlistPlanId } from "../api/client.ts"
import type { MessageKey } from "../i18n/messages.ts"

type FreePlanCard = {
  id: "free"
  waitlist: false
  eyebrowKey: MessageKey
  priceKey: MessageKey
  descriptionKey: MessageKey
  featureKeys: MessageKey[]
}

type WaitlistPlanCard = {
  id: WaitlistPlanId
  waitlist: true
  dark: boolean
  eyebrowKey: MessageKey
  priceKey: MessageKey
  descriptionKey: MessageKey
  featureKeys: MessageKey[]
}

export type PlanCard = FreePlanCard | WaitlistPlanCard

export const plans: PlanCard[] = [
  {
    id: "free",
    waitlist: false,
    eyebrowKey: "pricing.free.eyebrow",
    priceKey: "pricing.free.price",
    descriptionKey: "pricing.free.description",
    featureKeys: [
      "pricing.free.feature1",
      "pricing.free.feature2",
      "pricing.free.feature3",
      "pricing.free.feature4",
      "pricing.free.feature5",
    ],
  },
  {
    id: "pro",
    waitlist: true,
    dark: true,
    eyebrowKey: "pricing.pro.eyebrow",
    priceKey: "pricing.planned",
    descriptionKey: "pricing.pro.description",
    featureKeys: ["pricing.pro.feature1", "pricing.pro.feature2", "pricing.pro.feature3"],
  },
  {
    id: "metered",
    waitlist: true,
    dark: false,
    eyebrowKey: "pricing.metered.eyebrow",
    priceKey: "pricing.planned",
    descriptionKey: "pricing.metered.description",
    featureKeys: ["pricing.metered.feature1", "pricing.metered.feature2"],
  },
]

export const pricingFaqs = [
  { questionKey: "pricing.faq.q1", answerKey: "pricing.faq.a1" },
  { questionKey: "pricing.faq.q5", answerKey: "pricing.faq.a5" },
  { questionKey: "pricing.faq.q2", answerKey: "pricing.faq.a2" },
  { questionKey: "pricing.faq.q3", answerKey: "pricing.faq.a3" },
  { questionKey: "pricing.faq.q4", answerKey: "pricing.faq.a4" },
] as const satisfies ReadonlyArray<{ questionKey: MessageKey; answerKey: MessageKey }>
