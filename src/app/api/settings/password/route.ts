import { changePasswordSchema } from "@/modules/auth/schema";
import { changePassword } from "@/modules/auth/service";
import { authedRoute, noContent, parseJson } from "@/server/http";
import { RATE_LIMITS } from "@/server/rate-limit";

export const POST = authedRoute(
  async ({ request, user }) => {
    const { currentPassword, newPassword } = await parseJson(request, changePasswordSchema);
    await changePassword(user.id, currentPassword, newPassword);
    return noContent();
  },
  { rateLimit: RATE_LIMITS.loginByEmail },
);
