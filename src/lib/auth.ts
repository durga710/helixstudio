import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { db, dbEnabled, schemaReady } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

/** Demo workspace account — available until a database is connected. */
export const DEMO_USER = {
  id: "demo",
  name: "Durga",
  email: "demo@helixstudio.org",
  initials: "DG",
} as const;

const DEMO_PASSWORD = "helix-demo";

export const oauthProviders = {
  github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
};

/* Demo mode: no database and no real identity providers — the only sign-in is
 * the public demo account. A baked-in JWT secret grants nothing beyond what
 * those public credentials already do, so the app can run with zero env vars.
 * The moment OAuth or DATABASE_URL is configured, AUTH_SECRET becomes
 * mandatory in production (real sessions must not be forgeable). */
const demoMode = !process.env.DATABASE_URL && !oauthProviders.github && !oauthProviders.google;

const fallbackSecret =
  demoMode || process.env.NODE_ENV !== "production"
    ? "helix-demo-mode-secret-set-AUTH_SECRET-before-adding-real-users"
    : undefined;

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";

      // Real accounts (DATABASE_URL configured): Prisma lookup + scrypt verify.
      if (dbEnabled()) {
        await schemaReady();
        const user = await db().user.findUnique({ where: { email } });
        if (user?.passwordHash && verifyPassword(password, user.passwordHash)) {
          return { id: user.id, name: user.name, email: user.email };
        }
      }

      // Demo account — kept available in every mode.
      if (email === DEMO_USER.email && password === DEMO_PASSWORD) {
        return { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email };
      }
      return null;
    },
  }),
];

if (oauthProviders.github) providers.push(GitHub);
if (oauthProviders.google) providers.push(Google);

const config: NextAuthConfig = {
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? fallbackSecret,
  callbacks: {
    /* On OAuth sign-in with the database connected: upsert the user and keep
     * the provider account (incl. access token) so the server can act on the
     * user's behalf — e.g. importing their private GitHub repos. The token is
     * stored server-side only and never exposed to the client session. */
    async signIn({ user, account }) {
      if (!dbEnabled() || !account || account.provider === "credentials") return true;
      try {
        const email = user.email?.toLowerCase();
        if (!email) return true;
        await schemaReady();
        const dbUser = await db().user.upsert({
          where: { email },
          update: { name: user.name ?? undefined, image: user.image ?? undefined },
          create: { email, name: user.name ?? null, image: user.image ?? null },
        });
        await db().account.upsert({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
          update: {
            access_token: account.access_token ?? null,
            refresh_token: account.refresh_token ?? null,
            expires_at: account.expires_at ?? null,
            scope: account.scope ?? null,
          },
          create: {
            userId: dbUser.id,
            type: account.type,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            access_token: account.access_token ?? null,
            refresh_token: account.refresh_token ?? null,
            expires_at: account.expires_at ?? null,
            token_type: account.token_type ?? null,
            scope: account.scope ?? null,
          },
        });
      } catch {
        // Persistence failure must not block sign-in; the session still works.
      }
      return true;
    },
    async jwt({ token, account, user }) {
      // Pin the JWT to the database user id so lookups are stable.
      if (dbEnabled() && account && user?.email) {
        await schemaReady();
        const dbUser = await db().user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (dbUser) token.sub = dbUser.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
