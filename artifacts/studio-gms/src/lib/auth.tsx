import { createContext, useContext, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, login as loginRequest, logout as logoutRequest } from "@workspace/api-client-react";
import type { AppUser, LoginInput } from "@workspace/api-client-react";

interface AuthContextValue {
  user: AppUser | null;
  isLoading: boolean;
  isSignedIn: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await getMe();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const login = useCallback(
    async (input: LoginInput) => {
      const user = await loginRequest(input);
      queryClient.setQueryData(["auth", "me"], user);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.clear();
  }, [queryClient]);

  const value: AuthContextValue = {
    user: data ?? null,
    isLoading,
    isSignedIn: !!data,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
