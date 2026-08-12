import { redirect } from "next/navigation";

import { getAuthenticationEntryPath } from "@/lib/auth/config";
import { getAuthenticatedIdentity } from "@/lib/auth/identity";

export default async function Home() {
  const identity = await getAuthenticatedIdentity();

  if (!identity) {
    redirect(getAuthenticationEntryPath());
  }

  redirect("/app");
}
