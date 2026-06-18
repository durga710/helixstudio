import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isGuest?: boolean;
    } & DefaultSession["user"];
  }
  interface User {
    isGuest?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    guest?: boolean;
    checkedAt?: number;
    /** Fingerprint of the user's password hash when this session was issued. If
     * it stops matching the DB (i.e. the password was reset), the session is
     * killed on the next revalidation. */
    pwc?: string;
  }
}
