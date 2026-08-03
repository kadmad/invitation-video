import { create } from "zustand";
import type { User } from "@/types";
import { getMe, loginWithEmail, sendOTP as sendOTPApi, verifyOTP as verifyOTPApi } from "@/api/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  showAuthModal: boolean;
  authModalCallback: (() => void) | null;
  adminLogin: (email: string, password: string) => Promise<void>;
  sendOTP: (phone: string) => Promise<void>;
  verifyOTP: (phone: string, otp: string) => Promise<{ is_new_user: boolean }>;
  logout: () => void;
  loadUser: () => Promise<void>;
  openAuthModal: (onSuccess?: () => void) => void;
  closeAuthModal: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("token"),
  loading: !!localStorage.getItem("token"),
  showAuthModal: false,
  authModalCallback: null,

  adminLogin: async (email, password) => {
    const { access_token } = await loginWithEmail(email, password);
    localStorage.setItem("token", access_token);
    set({ token: access_token });
    const user = await getMe();
    if (!user.is_admin) {
      localStorage.removeItem("token");
      set({ user: null, token: null });
      throw new Error("Not an admin account");
    }
    set({ user });
  },

  sendOTP: async (phone) => {
    await sendOTPApi(phone);
  },

  verifyOTP: async (phone, otp) => {
    const { access_token, is_new_user } = await verifyOTPApi(phone, otp);
    localStorage.setItem("token", access_token);
    set({ token: access_token });
    const user = await getMe();
    set({ user, showAuthModal: false });
    const callback = get().authModalCallback;
    if (callback) {
      set({ authModalCallback: null });
      callback();
    }
    return { is_new_user };
  },

  logout: () => {
    localStorage.removeItem("token");
    set({ user: null, token: null });
  },

  loadUser: async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      set({ loading: false });
      return;
    }
    set({ loading: true });
    try {
      const user = await getMe();
      set({ user, token });
    } catch {
      localStorage.removeItem("token");
      set({ user: null, token: null });
    } finally {
      set({ loading: false });
    }
  },

  openAuthModal: (onSuccess) => {
    set({ showAuthModal: true, authModalCallback: onSuccess ?? null });
  },

  closeAuthModal: () => {
    set({ showAuthModal: false, authModalCallback: null });
  },
}));
