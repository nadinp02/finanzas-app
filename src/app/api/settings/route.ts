import { updateSettingsSchema } from "@/modules/settings/schema";
import { updateSettings } from "@/modules/settings/service";
import { authedRoute, noContent, parseJson } from "@/server/http";

export const PATCH = authedRoute(async ({ request, user }) => {
  await updateSettings(user.id, await parseJson(request, updateSettingsSchema));
  return noContent();
});
