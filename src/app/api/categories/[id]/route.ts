import { deleteCategorySchema, updateCategorySchema } from "@/modules/categories/schema";
import { deleteCategory, updateCategory } from "@/modules/categories/service";
import { authedRoute, json, noContent, parseJson, parseSearchParams } from "@/server/http";

export const PATCH = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  await updateCategory(user.id, params.id, await parseJson(request, updateCategorySchema));
  return noContent();
});

export const DELETE = authedRoute<{ id: string }>(async ({ request, params, user }) => {
  const { reassignTo } = parseSearchParams(request, deleteCategorySchema);
  return json(await deleteCategory(user.id, params.id, reassignTo));
});
