import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

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

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      // Demo-mode credential check. With DATABASE_URL configured this is where
      // the Prisma user lookup + scrypt verification goes (see docs/DATABASE.md).
      const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
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
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV !== "production" ? "helix-dev-secret-do-not-use-in-production" : undefined),
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
