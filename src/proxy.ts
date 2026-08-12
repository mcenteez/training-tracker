import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const clerkProxy = clerkMiddleware();

export default function proxy(...args: Parameters<typeof clerkProxy>) {
  if (process.env.AUTH_MODE === "local") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local authentication cannot run in production");
    }

    return NextResponse.next();
  }

  return clerkProxy(...args);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
