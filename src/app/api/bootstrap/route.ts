import { getBootstrap } from "@/modules/settings/service";
import { authedRoute, json } from "@/server/http";

export const GET = authedRoute(async ({ user }) => json(await getBootstrap(user.id)));
