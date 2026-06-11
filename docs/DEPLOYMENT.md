# Deployment — helixstudio.org on Vercel

The production app lives at the repository root (Next.js App Router) and deploys to Vercel
with `helixstudio.org` as the canonical domain.

## 1. Create the Vercel project

1. Vercel dashboard → **Add New → Project** → import `durga710/helixstudio`.
2. **Root Directory:** leave **empty** — the app lives at the repo root, so Vercel auto-detects Next.js with no configuration.
3. Framework preset: Next.js (auto-detected). Build command and output: defaults.
4. Deploy once to get the `*.vercel.app` URL working before attaching the domain.

## 2. Attach the domain

Project → **Settings → Domains**:

1. Add `helixstudio.org` → set as **Primary** (production).
2. Add `www.helixstudio.org` → choose **Redirect to helixstudio.org** (308).
   The app also enforces www → apex in `next.config.ts` as a backstop.

## 3. DNS records (at your registrar)

Use the exact values the Vercel Domains screen shows you — they take precedence.
The standard records are:

| Host | Type  | Value                  |
|------|-------|------------------------|
| `@`  | A     | `76.76.21.21`          |
| `www`| CNAME | `cname.vercel-dns.com` |

Alternative: delegate the whole zone to Vercel DNS by switching nameservers to
`ns1.vercel-dns.com` / `ns2.vercel-dns.com` — then Vercel manages the records itself.

Propagation is usually minutes; Vercel issues the TLS certificate automatically once
the records resolve.

## 4. Environment variables (Vercel → Settings → Environment Variables)

| Name                   | Value                                  | Notes |
|------------------------|----------------------------------------|-------|
| `AUTH_SECRET`          | `openssl rand -base64 32`              | required in production |
| `AUTH_URL`             | `https://helixstudio.org`              | Auth.js canonical URL |
| `NEXT_PUBLIC_APP_URL`  | `https://helixstudio.org`              | client-side canonical URL |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | from the GitHub OAuth app | optional — provider hidden when unset |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | from Google Cloud Console | optional — provider hidden when unset |
| `DATABASE_URL`         | PostgreSQL connection string            | optional — app runs in demo mode without it |
| `ANTHROPIC_API_KEY`    | for live AI responses                   | optional — mock provider used when unset |

### OAuth callback URLs

- GitHub OAuth app → Authorization callback URL: `https://helixstudio.org/api/auth/callback/github`
- Google OAuth client → Authorized redirect URI: `https://helixstudio.org/api/auth/callback/google`
- Add the `*.vercel.app` equivalents too if you want OAuth on preview deployments.

## 5. Verify

- `https://helixstudio.org` serves the app over HTTPS.
- `https://www.helixstudio.org` 308-redirects to the apex.
- `curl -sI https://helixstudio.org | grep -i strict-transport` shows HSTS (set in `next.config.ts`).
