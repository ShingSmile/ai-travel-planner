import { headers } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { ApiErrorResponse } from "@/lib/api-response";

export interface SessionUser {
  id: string;
  email: string | null;
}

interface AuthContext {
  supabase: SupabaseClient<Database>;
  user: SessionUser;
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function assertEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }
  return value;
}

export async function requireAuthContext(): Promise<AuthContext> {
  const headerStore = await headers();
  const authHeader = headerStore.get("Authorization") ?? headerStore.get("authorization");

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new ApiErrorResponse("未授权访问", 401, "unauthorized");
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new ApiErrorResponse("未授权访问", 401, "unauthorized");
  }

  const supabaseUrl = assertEnv(getSupabaseUrl(), "SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = assertEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY"
  );
  const anonKey = assertEnv(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );

  const serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await serviceClient.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new ApiErrorResponse("凭证已失效或不存在", 401, "unauthorized", error);
  }

  const supabase = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  return {
    supabase,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
  };
}
