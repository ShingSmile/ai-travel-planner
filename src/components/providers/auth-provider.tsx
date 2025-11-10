"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase-client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabaseClient = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch (error) {
      console.error("Failed to initialize Supabase client", error);
      return null;
    }
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => supabaseClient !== null);

  useEffect(() => {
    if (!supabaseClient) {
      return;
    }

    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    supabaseClient.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) {
          return;
        }
        setUser(data.session?.user ?? null);
      })
      .catch((error) => {
        console.error("Failed to fetch Supabase session", error);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    const { data } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }
      setUser(session?.user ?? null);
    });
    subscription = data.subscription;

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [supabaseClient]);

  const handleSignOut = useCallback(async () => {
    if (!supabaseClient) {
      return;
    }

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      console.error("Sign-out failed", error);
      throw error;
    }

    setUser(null);
  }, [supabaseClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signOut: handleSignOut,
    }),
    [user, loading, handleSignOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
