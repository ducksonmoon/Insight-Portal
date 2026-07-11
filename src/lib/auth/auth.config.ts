import type { NextAuthConfig } from "next-auth";

/**
 * Edge/proxy-safe auth config — no Prisma, bcrypt, or Rahkaran imports.
 * Used by middleware/proxy and merged into the full auth.ts server config.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.isAdmin = Boolean((user as { isAdmin?: boolean }).isAdmin);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
} satisfies NextAuthConfig;
