import { todayIn } from "@/lib/dates";
import { dashboardQuerySchema } from "@/modules/reports/schema";
import { getDashboard } from "@/modules/reports/service";
import { authedRoute, json, parseSearchParams } from "@/server/http";

export const GET = authedRoute(async ({ request, user }) => {
  const { month } = parseSearchParams(request, dashboardQuerySchema);
  return json(await getDashboard(user, month, todayIn(user.timezone)));
});
