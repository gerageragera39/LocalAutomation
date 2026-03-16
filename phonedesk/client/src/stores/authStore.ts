import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthStore {
  token: string | null;
  mustChangePin: boolean;
  setSession: (token: string, mustChangePin: boolean) => void;
  clearSession: () => void;
  setMustChangePin: (value: boolean) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      mustChangePin: false,
      setSession: (token: string, mustChangePin: boolean) =>
        set({
          token,
          mustChangePin,
        }),
      clearSession: () =>
        set({
          token: null,
          mustChangePin: false,
        }),
      setMustChangePin: (value: boolean) =>
        set({
          mustChangePin: value,
        }),
    }),
    {
      name: "phonedesk-auth",
    },
  ),
);
