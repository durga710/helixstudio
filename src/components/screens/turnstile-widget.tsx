"use client";

import { useEffect, useRef } from "react";

/** Whether the CAPTCHA is configured on the client (site key present). */
export const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile widget. Renders nothing (and requires nothing) unless
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set — so the forms work unchanged until the
 * keys are wired. Calls onToken with the solved token (or "" on error/expiry).
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Keep the latest callback without re-running the render effect.
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!captchaSiteKey) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !ref.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: captchaSiteKey,
        theme: "dark",
        callback: (token: string) => cb.current(token),
        "error-callback": () => cb.current(""),
        "expired-callback": () => cb.current(""),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!s) {
        s = document.createElement("script");
        s.src = SCRIPT;
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", render);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (!captchaSiteKey) return null;
  return <div ref={ref} className="mt-4" />;
}
