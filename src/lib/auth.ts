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

/** AI tokens a guest may burn before being asked to sign in. */
export const GUEST_TOKEN_LIMIT = 15_000;

export const oauthProviders = {
  github: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
};

/* Demo mode: no database and no real identity providers — the only sign-in is
 * the public demo account. A baked-in JWT secret grants nothing beyond what
 * those public credentials already do, so the app can run with zero env vars.
 * The moment OAuth or DATABASE_URL is configured, AUTH_SECRET becomes
 * mandatory in production (real sessions must not be forgeable). */
export const demoMode = !process.env.DATABASE_URL && !oauthProviders.github && !oauthProviders.google;

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

      // Demo account — kept available in every mode. With a database, the demo
      // user gets a real row so FK-backed features (workspaces) work for it.
      if (email === DEMO_USER.email && password === DEMO_PASSWORD) {
        if (dbEnabled()) {
          await schemaReady();
          const user = await db().user.upsert({
            where: { email: DEMO_USER.email },
            update: {},
            create: { email: DEMO_USER.email, name: DEMO_USER.name },
          });
          return { id: user.id, name: user.name, email: user.email };
        }
        return { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email };
      }
      return null;
    },
  }),
];

// "Continue as guest" — creates a real (anonymous) User row so workspaces and
// preferences work normally; the JWT carries isGuest so the editor chat route
// can enforce GUEST_TOKEN_LIMIT. Needs the database.
if (dbEnabled()) {
  providers.push(
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {},
      async authorize() {
        await schemaReady();
        const user = await db().user.create({ data: { name: "Guest", isGuest: true } });
        return { id: user.id, name: user.name, email: null, image: null, isGuest: true };
      },
    }),
  );
}

if (oauthProviders.github) {
  providers.push(
    GitHub({
      // `repo` grants read/write on the user's repos INCLUDING private ones —
      // the same credential powers repo import and push from the editor.
      authorization: { params: { scope: "repo read:user user:email" } },
      // Same-email accounts link instead of erroring (OAuthAccountNotLinked).
      // Safe here: GitHub and Google both verify email ownership.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}
if (oauthProviders.google) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

const config: NextAuthConfig = {
  providers,
  // Persistent sessions: signed in for 30 days (rolling — refreshed on
  // activity once a day) until the user explicitly signs out.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? fallbackSecret,
  callbacks: {
    /* On OAuth sign-in with the database connected: upsert the user and keep
     * the provider account (incl. access token) so the server can act on the
     * user's behalf — e.g. importing their private GitHub repos. The token is
     * stored server-side only and never exposed to the client session. The
     * upsert also refreshes the access token on every sign-in, so a
     * revoked-then-reconnected GitHub account works again. */
    async signIn({ user, account }) {
      if (!dbEnabled() || !account || account.provider === "credentials" || account.provider === "guest")
        return true;
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
      // At sign-in the user object is present — pin the token to the DATABASE
      // user id. Credentials providers (password, demo, guest) already return
      // the DB id; OAuth returns the provider profile, so resolve by email.
      if (user) {
        if (dbEnabled() && account && account.provider !== "credentials" && account.provider !== "guest" && user.email) {
          await schemaReady();
          const dbUser = await db().user.findUnique({ where: { email: user.email.toLowerCase() } });
          if (dbUser) token.sub = dbUser.id;
          token.guest = false;
        } else {
          if (user.id) token.sub = user.id;
          token.guest = Boolean((user as { isGuest?: boolean }).isGuest);
        }
        token.checkedAt = Date.now();
        return token;
      }
      // Session revalidation (at most once a minute): the DB is the source of
      // truth. Kills sessions whose user was deleted (e.g. an upgraded guest
      // account) and keeps the guest flag honest — a stale token can never
      // demote a signed-in user back to guest or resurrect a removed account.
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      if (dbEnabled() && token.sub && Date.now() - checkedAt > 60_000) {
        await schemaReady();
        const dbUser = await db().user.findUnique({
          where: { id: token.sub },
          select: { isGuest: true },
        });
        if (!dbUser) return null; // user no longer exists → invalidate session
        token.guest = dbUser.isGuest;
        token.checkedAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      if (session.user) session.user.isGuest = Boolean(token.guest);
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Throwable auth guard for API routes — caller catches and maps to 401. */
export class AuthError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthError";
  }
}

/** Returns the signed-in user or throws AuthError. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) throw new AuthError();
  return { id: u.id, name: u.name ?? null, email: u.email ?? null, image: u.image ?? null };
}

/**
 * The GitHub token for a user, resolved in priority order:
 *   1. Pasted PAT in Settings (UserPreferences.githubToken) — explicit override
 *      for people who prefer fine-grained scopes.
 *   2. The OAuth access token from signing in with GitHub.
 * Null = not connected → the UI shows a "Connect GitHub" prompt.
 */
export async function getGitHubToken(userId: string): Promise<string | null> {
  if (!dbEnabled()) return null;
  await schemaReady();
  const [prefs, account] = await Promise.all([
    db().userPreferences.findUnique({
      where: { userId },
      select: { githubToken: true },
    }),
    db().account.findFirst({
      where: { userId, provider: "github" },
      select: { access_token: true },
    }),
  ]);
  return prefs?.githubToken || account?.access_token || null;
}
