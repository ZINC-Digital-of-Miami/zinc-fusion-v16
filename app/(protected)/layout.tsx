import type { ReactNode } from "react";
import { connection } from "next/server";

import { requireAuthenticatedPageSession } from "@/lib/server/auth-guards";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await connection();
  await requireAuthenticatedPageSession();
  return children;
}
