"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isLocalAuthEnabled } from "@/lib/auth/config";
import {
  isLocalPersonaKey,
  localAuthCookieName,
} from "@/lib/auth/local-personas";

function getSafeRedirectPath(value: FormDataEntryValue | null): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/app";
}

export async function selectLocalPersonaAction(formData: FormData) {
  if (!isLocalAuthEnabled()) {
    throw new Error("Local authentication is disabled");
  }

  const persona = formData.get("persona");

  if (typeof persona !== "string" || !isLocalPersonaKey(persona)) {
    throw new Error("Unknown local persona");
  }

  const cookieStore = await cookies();
  cookieStore.set(localAuthCookieName, persona, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });

  redirect(getSafeRedirectPath(formData.get("redirect_url")));
}

export async function clearLocalPersonaAction() {
  if (!isLocalAuthEnabled()) {
    throw new Error("Local authentication is disabled");
  }

  const cookieStore = await cookies();
  cookieStore.delete(localAuthCookieName);
  redirect("/dev/auth");
}
