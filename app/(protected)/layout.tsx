import type { ReactNode } from "react";

import { requireAuthenticatedPageSession } from "@/lib/server/auth-guards";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedPageSession();
  return children;
}
