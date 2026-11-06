import { createCategorySchema } from "@/modules/categories/schema";
import { createCategory, listCategories } from "@/modules/categories/service";
import { authedRoute, json, parseJson } from "@/server/http";

export const GET = authedRoute(async ({ user }) => json(await listCategories(user.id)));

export const POST = authedRoute(async ({ request, user }) =>
  json(await createCategory(user.id, await parseJson(request, createCategorySchema)), 201),
);
