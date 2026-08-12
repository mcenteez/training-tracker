import "server-only";

import { cookies } from "next/headers";

import { getClerkIdentity } from "./clerk-identity";
import { getAuthMode } from "./config";
import {
  isLocalPersonaKey,
  localAuthCookieName,
  localPersonas,
} from "./local-personas";

export interface AuthenticatedIdentity {
  externalId: string;
  email: string;
  fullName: string | null;
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  if (getAuthMode() === "clerk") {
    return getClerkIdentity();
  }

  const cookieStore = await cookies();
  const personaKey = cookieStore.get(localAuthCookieName)?.value;

  if (!personaKey || !isLocalPersonaKey(personaKey)) {
    return null;
  }

  const persona = localPersonas[personaKey];

  return {
    externalId: persona.externalId,
    email: persona.email,
    fullName: persona.fullName,
  };
}
