import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Helix Studio collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "June 17, 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <p>
        This Privacy Policy explains how Helix Studio (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects,
        uses, and protects your information when you use Helix Studio (the &ldquo;Service&rdquo;). We
        aim to collect only what we need to run the Service for you.
      </p>

      <LegalSection heading="1. Information we collect">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong className="text-[#e7edf6]">Account data</strong> — your name, email address, and
            authentication provider (GitHub/Google) when you sign in. Passwords are stored only as a
            salted, hashed value; we never store them in plain text.
          </li>
          <li>
            <strong className="text-[#e7edf6]">Your Content</strong> — the prompts, code, files, and
            project data you create, import, or generate in the Service.
          </li>
          <li>
            <strong className="text-[#e7edf6]">Connected services</strong> — access tokens for
            services you link (such as GitHub or a deployment platform), stored to act on your behalf
            (for example, importing or pushing repositories). These are kept server-side and never
            exposed to your browser session.
          </li>
          <li>
            <strong className="text-[#e7edf6]">Usage data</strong> — basic technical and product
            telemetry such as AI token usage (for metering and limits), error reports, and request
            metadata used to operate, secure, and improve the Service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. How we use information">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>to provide, maintain, and improve the Service;</li>
          <li>to generate AI output you request and to enforce usage limits and plans;</li>
          <li>to authenticate you and keep your account and data secure;</li>
          <li>to detect, prevent, and address abuse, fraud, or technical issues;</li>
          <li>to communicate with you about your account (for example, password resets).</li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. AI processing and subprocessors">
        <p>
          When you use AI features, your prompts and relevant project context are sent to third-party
          AI model providers to generate output. We also rely on infrastructure and tooling providers
          to run the Service, which may include hosting, database, email delivery, error monitoring,
          and payment processing. These providers process data on our behalf under their own terms and
          security commitments.
        </p>
      </LegalSection>

      <LegalSection heading="4. Cookies">
        <p>
          We use strictly necessary cookies to keep you signed in and to operate core features (for
          example, your session and, if you provide one, a bring-your-own AI key stored in a secure
          HTTP-only cookie). We do not use these for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="5. Data sharing">
        <p>
          We do not sell your personal information. We share data only with the subprocessors
          described above, when required by law, or to protect the rights, safety, and security of our
          users and the Service. If we are involved in a merger or acquisition, your data may be
          transferred subject to this Policy.
        </p>
      </LegalSection>

      <LegalSection heading="6. Data retention">
        <p>
          We keep your data for as long as your account is active or as needed to provide the Service.
          Guest accounts and their data may be deleted after a period of inactivity. You can delete
          your projects at any time, and you can request deletion of your account and associated data
          (see &ldquo;Your rights&rdquo; below).
        </p>
      </LegalSection>

      <LegalSection heading="7. Your rights">
        <p>
          Depending on your location, you may have the right to access, correct, export, or delete
          your personal data, and to object to or restrict certain processing. To exercise these
          rights, email{" "}
          <a href="mailto:privacy@helixstudio.org" className="text-accent hover:underline">
            privacy@helixstudio.org
          </a>{" "}
          and we will respond within a reasonable time.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          We use industry-standard measures to protect your data, including encryption in transit,
          hashed passwords, and access controls. No system is perfectly secure, but we work to protect
          your information and to address vulnerabilities responsibly.
        </p>
      </LegalSection>

      <LegalSection heading="9. Children">
        <p>
          The Service is not directed to children under 13, and we do not knowingly collect personal
          data from them. If you believe a child has provided us data, contact us and we will delete
          it.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to this Policy">
        <p>
          We may update this Policy from time to time. We will revise the &ldquo;Last updated&rdquo;
          date above and, for material changes, provide additional notice where appropriate.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Questions about your privacy? Email{" "}
          <a href="mailto:privacy@helixstudio.org" className="text-accent hover:underline">
            privacy@helixstudio.org
          </a>
          . See also our{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
