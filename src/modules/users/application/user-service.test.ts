import { describe, expect, it, vi } from "vitest";

import { getOrCreateUserByClerkId } from "./user-service";

function createDatabaseMock(options?: {
  existingUser?: {
    id: string;
    clerkUserId: string;
    email: string;
    fullName: string | null;
  };
  createdUser?: {
    id: string;
    clerkUserId: string;
    email: string;
    fullName: string | null;
  };
  fallbackUser?: {
    id: string;
    clerkUserId: string;
    email: string;
    fullName: string | null;
  };
  updatedUser?: {
    id: string;
    clerkUserId: string;
    email: string;
    fullName: string | null;
  };
}) {
  const state = {
    firstSelectCall: 0,
    insertCall: 0,
    fallbackSelectCall: 0,
  };

  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => {
          state.firstSelectCall += 1;

          if (state.firstSelectCall === 1) {
            return options?.existingUser ? [options.existingUser] : [];
          }

          state.fallbackSelectCall += 1;
          return options?.fallbackUser ? [options.fallbackUser] : [];
        }),
      })),
    })),
  }));

  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        returning: vi.fn(async () => {
          state.insertCall += 1;
          return options?.createdUser ? [options.createdUser] : [];
        }),
      })),
    })),
  }));

  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => {
          return options?.updatedUser ? [options.updatedUser] : [];
        }),
      })),
    })),
  }));

  const transaction = {
    select,
    insert,
    update,
  };

  const database = {
    transaction: vi.fn(
      async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  return { database, state };
}

describe("user service", () => {
  it("returns an existing user when clerk identity already exists", async () => {
    const existingUser = {
      id: "user-1",
      clerkUserId: "clerk_user_1",
      email: "existing@example.com",
      fullName: null,
    };
    const { database } = createDatabaseMock({ existingUser });

    const result = await getOrCreateUserByClerkId(database as never, {
      clerkUserId: "clerk_user_1",
      email: "new@example.com",
    });

    expect(result).toEqual(existingUser);
  });

  it("creates a user when no existing clerk identity is found", async () => {
    const createdUser = {
      id: "user-2",
      clerkUserId: "clerk_user_2",
      email: "created@example.com",
      fullName: "Created User",
    };
    const { database } = createDatabaseMock({ createdUser });

    const result = await getOrCreateUserByClerkId(database as never, {
      clerkUserId: "clerk_user_2",
      email: "created@example.com",
      fullName: "Created User",
    });

    expect(result).toEqual(createdUser);
  });

  it("returns the conflicting row when concurrent create already inserted it", async () => {
    const fallbackUser = {
      id: "user-3",
      clerkUserId: "clerk_user_3",
      email: "winner@example.com",
      fullName: null,
    };
    const { database } = createDatabaseMock({ fallbackUser });

    const result = await getOrCreateUserByClerkId(database as never, {
      clerkUserId: "clerk_user_3",
      email: "candidate@example.com",
    });

    expect(result).toEqual(fallbackUser);
  });

  it("throws when user cannot be created or loaded", async () => {
    const { database } = createDatabaseMock();

    await expect(
      getOrCreateUserByClerkId(database as never, {
        clerkUserId: "missing",
        email: "missing@example.com",
      }),
    ).rejects.toThrow("Failed to create or load user");
  });

  it("updates existing user when profile email or name has changed", async () => {
    const existingUser = {
      id: "user-4",
      clerkUserId: "clerk_user_4",
      email: "old@example.com",
      fullName: null,
    };
    const updatedUser = {
      id: "user-4",
      clerkUserId: "clerk_user_4",
      email: "new@example.com",
      fullName: "New Name",
    };
    const { database } = createDatabaseMock({ existingUser, updatedUser });

    const result = await getOrCreateUserByClerkId(database as never, {
      clerkUserId: "clerk_user_4",
      email: "new@example.com",
      fullName: "New Name",
    });

    expect(result).toEqual(updatedUser);
  });
});
