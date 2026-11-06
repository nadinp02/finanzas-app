import { todayIn } from "@/lib/dates";
import { onboardingSchema } from "@/modules/onboarding/schema";
import { completeOnboarding } from "@/modules/onboarding/service";
import { authedRoute, noContent, parseJson } from "@/server/http";

export const POST = authedRoute(async ({ request, user }) => {
  const input = await parseJson(request, onboardingSchema);
  await completeOnboarding(user.id, input, todayIn(user.timezone));
  return noContent();
});
