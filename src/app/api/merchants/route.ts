import { createMerchantSchema } from "@/modules/merchants/schema";
import { createMerchant, listMerchants } from "@/modules/merchants/service";
import { authedRoute, json, parseJson } from "@/server/http";

export const GET = authedRoute(async ({ user }) => json(await listMerchants(user.id)));

export const POST = authedRoute(async ({ request, user }) =>
  json(await createMerchant(user.id, await parseJson(request, createMerchantSchema)), 201),
);
