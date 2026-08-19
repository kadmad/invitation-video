import client from "./client";
import type { User } from "@/types";

export async function googleAuth(code: string, redirect_uri: string, accepted_terms: boolean) {
  const { data } = await client.post<{
    access_token: string;
    is_new_user: boolean;
  }>("/auth/google", { code, redirect_uri, accepted_terms });
  return data;
}

export async function getMe() {
  const { data } = await client.get<User>("/auth/me");
  return data;
}
