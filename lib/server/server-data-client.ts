import "server-only";

import { isAuthDisabledForBuild } from "@/lib/auth-mode";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function createServerDataClient() {
  if (isAuthDisabledForBuild()) {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return createSupabaseAdminClient();
    }
    return await createRequestClient();
  }

  return await createRequestClient();
}
