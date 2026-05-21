import "server-only";

import { isAuthDisabledForBuild } from "@/lib/auth-mode";
import { createClient as createRequestClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

export async function createServerDataClient() {
  if (isAuthDisabledForBuild()) {
    return createSupabaseAdminClient();
  }

  return await createRequestClient();
}
