import { SignIn } from "@clerk/nextjs";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,color-mix(in_oklab,var(--primary)_24%,transparent),transparent_40%),radial-gradient(circle_at_85%_0%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_35%)]"
      />
      <Card className="relative w-full max-w-md border-primary/20 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <SignIn forceRedirectUrl="/" />
        </CardContent>
      </Card>
    </main>
  );
}
