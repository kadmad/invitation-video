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

export async function emailLogin(email: string, password: string) {
  const { data } = await client.post<{ access_token: string }>("/auth/login", { email, password });
  return data;
}

export async function setPassword(new_password: string, current_password?: string) {
  const { data } = await client.post<User>("/auth/set-password", { new_password, current_password });
  return data;
}

export async function updateProfile(full_name: string, first_name: string | null, last_name: string | null) {
  const { data } = await client.patch<User>("/auth/me", { full_name, first_name, last_name });
  return data;
}
