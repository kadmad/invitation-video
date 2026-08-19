import { create } from "zustand";
import type { User } from "@/types";
import { getMe, googleAuth } from "@/api/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  showAuthModal: boolean;
  authModalCallback: (() => void) | null;
  loginWithGoogle: (
    code: string,
    redirectUri: string,
    acceptedTerms: boolean
  ) => Promise<{ is_new_user: boolean }>;
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

  loginWithGoogle: async (code, redirectUri, acceptedTerms) => {
    const { access_token, is_new_user } = await googleAuth(code, redirectUri, acceptedTerms);
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
