import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { getAuthenticationEntryPath } from "@/lib/auth/config";
import { getAuthenticatedIdentity } from "@/lib/auth/identity";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const identity = await getAuthenticatedIdentity();

  if (!identity) {
    redirect(getAuthenticationEntryPath());
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
