import type { MessageKey } from "../i18n/messages.ts"

export type PlanCard = {
  id: string
  eyebrowKey: MessageKey
  priceKey: MessageKey
  descriptionKey: MessageKey
  featureKeys: MessageKey[]
}

export const plans: PlanCard[] = [
  {
    id: "free",
    eyebrowKey: "pricing.free.eyebrow",
    priceKey: "pricing.free.price",
    descriptionKey: "pricing.free.description",
    featureKeys: [
      "pricing.free.feature1",
      "pricing.free.feature2",
      "pricing.free.feature3",
      "pricing.free.feature4",
      "pricing.free.feature5",
      "pricing.free.feature6",
    ],
  },
]

export type PricingEntry = {
  key: MessageKey
  to: string
}

export const pricingEntries: PricingEntry[] = [
  { key: "pricing.entry.web", to: "/" },
  { key: "pricing.entry.cli", to: "/developers#cli" },
  { key: "pricing.entry.api", to: "/developers" },
]

export const pricingFaqs = [
  { questionKey: "pricing.faq.q1", answerKey: "pricing.faq.a1" },
  { questionKey: "pricing.faq.q5", answerKey: "pricing.faq.a5" },
  { questionKey: "pricing.faq.q2", answerKey: "pricing.faq.a2" },
  { questionKey: "pricing.faq.q3", answerKey: "pricing.faq.a3" },
  { questionKey: "pricing.faq.q4", answerKey: "pricing.faq.a4" },
] as const satisfies ReadonlyArray<{ questionKey: MessageKey; answerKey: MessageKey }>
