import type { PlanId } from "../../api/client.ts"
import type { MessageKey } from "../../i18n/messages.ts"

export const planLabelKeys: Record<PlanId, MessageKey> = {
  anonymous: "plan.anonymous",
  free: "plan.free",
}
