// Verifies the email-verification token: valid round-trip, tamper/forgery
// rejection, and purpose isolation from reset tokens.
//   npx tsx scripts/test-email-verify.mts
process.env.AUTH_SECRET = "test-secret";
const { makeVerifyToken, readVerifyToken } = await import("../src/lib/email-verify.js");
const { makeResetToken } = await import("../src/lib/password-reset.js");

let pass = 0, fail = 0;
const ok = (c: boolean, label: string) => { c ? (pass++, console.log("  PASS", label)) : (fail++, console.log("  FAIL", label)); };

const user = { id: "user_42", email: "Ada@Example.com" };
const token = makeVerifyToken(user);

const claim = readVerifyToken(token);
ok(claim?.uid === "user_42", "extracts uid");
ok(claim?.email === "ada@example.com", "normalizes + extracts email");

ok(readVerifyToken(token.slice(0, -3) + "zzz") === null, "rejects tampered signature");
ok(readVerifyToken("garbage") === null, "rejects malformed token");

// A password-reset token must NOT validate as a verify token (purpose-tagged key).
const resetTok = makeResetToken({ id: "user_42", passwordHash: "salt:hash" });
ok(readVerifyToken(resetTok) === null, "reset token can't be replayed as a verify token");

console.log(`\n=== email-verify: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
