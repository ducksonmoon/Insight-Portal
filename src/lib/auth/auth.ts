import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/lib/auth/auth.config";
import { prisma } from "@/lib/db/prisma";
import { syncRahkaranUserByUsername } from "@/lib/auth/sync-users";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "نام کاربری", type: "text" },
        password: { label: "رمز عبور", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");

        if (!username || !password) return null;

        try {
          await syncRahkaranUserByUsername(username);
        } catch {
          // Rahkaran may be offline — continue with local user
        }

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user || !user.isActive || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.displayName ?? user.username,
          email: user.email ?? undefined,
          isAdmin: user.isAdmin,
        };
      },
    }),
  ],
});
