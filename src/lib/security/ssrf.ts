import "server-only";

/**
 * SSRF guard for routes that fetch a user-supplied URL server-side. The
 * pref/git layer's sanitizeBaseUrl only enforces https-only; it does NOT block
 * private IP ranges (an https URL pointing at 10.x / 169.254.x still passes).
 * This resolves the host and rejects loopback / RFC-1918 / link-local targets.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

function ipv4IsPrivate(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 127 || a === 10) return true; // this-host, loopback, private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function ipIsPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4IsPrivate(ip);
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true; // loopback / unspecified
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true; // link-local / ULA
  const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/); // IPv4-mapped
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

/**
 * True if the URL's host is (or resolves to) a loopback / private / link-local
 * address — i.e. an SSRF target. Fails CLOSED: an unparseable URL or an
 * unresolvable host counts as unsafe.
 */
export async function resolvesToPrivateHost(rawUrl: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    return true;
  }
  const bare = host.replace(/^\[/, "").replace(/\]$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  )
    return true;
  if (net.isIP(bare)) return ipIsPrivate(bare);
  try {
    const results = await lookup(host, { all: true });
    return results.length === 0 || results.some((r) => ipIsPrivate(r.address));
  } catch {
    return true;
  }
}
