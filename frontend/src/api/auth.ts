import client from "./client";
import type { User } from "@/types";

export async function sendOTP(phone_number: string) {
  const { data } = await client.post<{ message: string; expires_in: number }>(
    "/auth/send-otp",
    { phone_number }
  );
  return data;
}

export async function verifyOTP(
  phone_number: string,
  otp: string,
  accepted_terms: boolean
) {
  const { data } = await client.post<{
    access_token: string;
    is_new_user: boolean;
  }>("/auth/verify-otp", { phone_number, otp, accepted_terms });
  return data;
}

export async function loginWithEmail(email: string, password: string) {
  const { data } = await client.post<{ access_token: string }>(
    "/auth/login",
    { email, password }
  );
  return data;
}

export async function getMe() {
  const { data } = await client.get<User>("/auth/me");
  return data;
}
