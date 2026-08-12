import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isLocalAuthEnabled } from "@/lib/auth/config";
import { localPersonas } from "@/lib/auth/local-personas";

import { clearLocalPersonaAction, selectLocalPersonaAction } from "./actions";

interface LocalAuthPageProps {
  searchParams: Promise<{ redirect_url?: string }>;
}

export default async function LocalAuthPage({
  searchParams,
}: LocalAuthPageProps) {
  if (!isLocalAuthEnabled()) {
    notFound();
  }

  const { redirect_url: redirectUrl = "/app" } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-5 py-10 sm:px-8">
      <Card className="w-full border-border/70 bg-card/95 shadow-xl shadow-black/15">
        <CardHeader>
          <CardTitle className="text-2xl">Choose a local persona</CardTitle>
          <CardDescription>
            Switch roles without creating a Clerk account. Permissions still
            come from local database memberships.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(localPersonas).map(([key, persona]) => (
              <form key={key} action={selectLocalPersonaAction}>
                <input type="hidden" name="persona" value={key} />
                <input type="hidden" name="redirect_url" value={redirectUrl} />
                <Button
                  type="submit"
                  variant="outline"
                  className="h-auto w-full justify-start px-4 py-3 text-left"
                >
                  <span>
                    <span className="block font-medium">{persona.label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {persona.email}
                    </span>
                  </span>
                </Button>
              </form>
            ))}
          </div>
          <form action={clearLocalPersonaAction}>
            <Button type="submit" variant="ghost">
              Clear selected persona
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
