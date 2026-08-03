import client from "./client";
import type { Category } from "@/types";

export async function listCategories() {
  const { data } = await client.get<Category[]>("/categories");
  return data;
}
