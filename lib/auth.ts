import { DatabaseSync } from "node:sqlite";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { wallet } from "./wallet/plugin.ts";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: new DatabaseSync("fuse.db"),
  plugins: [
    passkey({
      rpName: "Fuse",
      registration: {
        requireSession: false,
        resolveUser: () => ({ id: crypto.randomUUID(), name: "Fuse" }),
        // The user row is created only once the ceremony verifies, so a cancelled prompt leaves nothing behind.
        afterVerification: async ({ ctx, user }) => {
          const { internalAdapter } = ctx.context;
          if (await internalAdapter.findUserById(user.id)) return;
          const created = await internalAdapter.createUser(
            { name: "Fuse", email: `${user.id}@device.invalid`, emailVerified: false },
            { method: "passkey" },
          );
          return { userId: created.id };
        },
      },
    }),
    wallet(),
  ],
});

await (await getMigrations(auth.options)).runMigrations();
