import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing your use of Helix Studio.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "June 24, 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Helix Studio
        (the &ldquo;Service&rdquo;), an AI-assisted software development and media-creation platform
        operated by Helix Studio (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account, signing
        in, or using the Service — including as a guest — you agree to these Terms. If you do not
        agree, do not use the Service.
      </p>

      <LegalSection heading="1. Accounts">
        <p>
          You may use the Service as a guest with limited usage, or create an account using email and
          password or a third-party provider (GitHub, Google). You are responsible for the activity
          under your account and for keeping your credentials secure. You must be at least 13 years
          old, and old enough to form a binding contract in your jurisdiction, to use the Service.
        </p>
        <p>
          Guest sessions are temporary. We may delete guest accounts and their data after a period of
          inactivity. Sign in to keep your work.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your content">
        <p>
          &ldquo;Your Content&rdquo; means the code, prompts, files, images, audio, video, project
          recipes, and other material you create, upload, or import into the Service, and the output
          the Service generates for you. As between you and us, you own Your Content. You grant us a
          limited license to host, store, process, and display Your Content solely to operate and
          improve the Service for you, and — where you choose to publish or share it — to make it
          available to others as described in these Terms.
        </p>
        <p>
          You are responsible for Your Content and for ensuring you have the rights to use any code,
          repositories, images, audio, or other material you upload or import. Do not upload content
          that infringes others&rsquo; rights or that you are not permitted to share.
        </p>
      </LegalSection>

      <LegalSection heading="3. AI-generated output and media">
        <p>
          The Service uses third-party AI models to generate code, text, images, video, audio, and
          other output from the prompts and inputs you provide. AI output may be inaccurate,
          incomplete, insecure, or unsuitable for your purpose, and similar output may be generated
          for other users. You are responsible for reviewing, testing, and validating any output
          before relying on, deploying, exporting, publishing, or distributing it. The Service is an
          assistant, not a substitute for professional judgment.
        </p>
        <p>
          Features such as HelixVideo generate media from your prompts, scripts, and any reference
          images or other inputs you supply. You are responsible for the inputs you provide and for
          how you use, export, publish, or distribute the media you create.
        </p>
      </LegalSection>

      <LegalSection heading="4. Synthetic media, likeness, and voice">
        <p>
          AI-generated and AI-edited media (including video, images, and synthesized voices) can
          depict people, voices, and scenes that are not real. You agree that you will not use the
          Service to:
        </p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            create or share media that impersonates a real person, or that depicts an identifiable
            person (including any public figure) without the rights or consent to do so;
          </li>
          <li>
            generate or upload reference images, faces, or voices you do not have the right to use;
          </li>
          <li>
            produce media intended to deceive, defraud, harass, defame, or mislead, or that is
            presented as authentic when it is synthetic;
          </li>
          <li>
            generate sexual, violent, hateful, or otherwise prohibited content, or any content that
            sexualizes or endangers minors.
          </li>
        </ul>
        <p>
          You are solely responsible for the media you generate and how you use it, and for complying
          with laws on synthetic media, publicity, privacy, and disclosure that apply to you. We may
          remove media and suspend or terminate accounts that violate this section.
        </p>
      </LegalSection>

      <LegalSection heading="5. Community, publishing, and remixing">
        <p>
          The Service includes a community where you may publish projects, videos, and project recipes
          (such as a video&rsquo;s transcript and shot list). When you publish, you make that content
          visible to other users and grant us and them the ability to view it, and — where you enable
          remixing or forking — to create derivative projects from it. You can unpublish content,
          though copies others have already forked remain theirs.
        </p>
        <p>
          You are responsible for everything you publish, including that you hold the necessary rights
          and that it complies with these Terms. Do not publish content that is unlawful, infringing,
          deceptive, or otherwise prohibited. When you remix or fork content published by others,
          respect any licenses and attribution that apply.
        </p>
        <p>
          We may moderate, label, rank, feature, hide, or remove community content, and may publish
          official or example content, at our discretion. We are not obligated to monitor content, but
          we may do so.
        </p>
      </LegalSection>

      <LegalSection heading="6. Third-party publishing and embeds">
        <p>
          To share a video in the community, you may upload it to a third-party platform (such as
          YouTube, Vimeo, or Loom) and provide a link, which the Service embeds. Your use of those
          platforms is governed by their own terms, and you are responsible for the content you upload
          to them and for setting an appropriate visibility (for example, public or unlisted) so that
          others can view it.
        </p>
        <p>
          Embedded content is hosted and served by the third-party platform, not by us. We do not
          control and are not responsible for its availability, or for content you make available
          through those platforms.
        </p>
      </LegalSection>

      <LegalSection heading="7. Copyright and takedowns">
        <p>
          We respect intellectual-property rights and expect you to do the same. If you believe
          content on the Service infringes your copyright or other rights, contact us at{" "}
          <a href="mailto:legal@helixstudio.org" className="text-accent hover:underline">
            legal@helixstudio.org
          </a>{" "}
          with enough detail to identify the content and your rights. We may remove allegedly
          infringing content, and may suspend or terminate accounts of users who repeatedly infringe.
        </p>
      </LegalSection>

      <LegalSection heading="8. Bring-your-own keys and third-party services">
        <p>
          You may connect your own AI provider API keys and third-party accounts (such as GitHub or a
          deployment platform). Your use of those services is governed by their own terms, and you are
          responsible for any charges they bill you. We are not responsible for third-party services
          or for any keys you choose to provide.
        </p>
      </LegalSection>

      <LegalSection heading="9. Acceptable use">
        <p>You agree not to:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>use the Service to build or distribute malware, spam, or unlawful material;</li>
          <li>attempt to disrupt, overload, reverse-engineer, or circumvent limits of the Service;</li>
          <li>resell or abuse platform-provided AI capacity, or evade usage metering;</li>
          <li>
            impersonate any person or entity, or present synthetic media as authentic, in violation of
            Section 4;
          </li>
          <li>violate the rights of others or any applicable law.</li>
        </ul>
        <p>
          We may suspend or terminate accounts that violate these Terms or that put the Service or its
          users at risk.
        </p>
      </LegalSection>

      <LegalSection heading="10. Plans, billing, and usage limits">
        <p>
          The Service offers free and paid plans. Free and guest usage is subject to AI-usage limits.
          Some features, including media generation, may require a paid plan. Paid plans are billed
          through our payment processor on a recurring basis until cancelled. Fees are non-refundable
          except where required by law. We may change pricing or limits with reasonable notice for
          future billing periods.
        </p>
      </LegalSection>

      <LegalSection heading="11. Intellectual property">
        <p>
          The Service itself — including its software, design, and trademarks — is owned by us and our
          licensors. These Terms do not grant you any rights to our branding except as needed to use
          the Service normally.
        </p>
      </LegalSection>

      <LegalSection heading="12. Disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
          warranties of any kind, whether express or implied, including merchantability, fitness for a
          particular purpose, and non-infringement. We do not warrant that the Service will be
          uninterrupted, error-free, or secure, or that AI output or generated media will meet your
          requirements.
        </p>
      </LegalSection>

      <LegalSection heading="13. Limitation of liability">
        <p>
          To the maximum extent permitted by law, we will not be liable for any indirect, incidental,
          special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising
          from your use of the Service. Our total liability for any claim relating to the Service will
          not exceed the greater of the amount you paid us in the twelve months before the claim or
          USD 100.
        </p>
      </LegalSection>

      <LegalSection heading="14. Termination">
        <p>
          You may stop using the Service at any time. We may suspend or terminate your access if you
          breach these Terms or if we discontinue the Service. On termination, your right to use the
          Service ends; sections that by their nature should survive (such as ownership, disclaimers,
          and limitation of liability) will survive.
        </p>
      </LegalSection>

      <LegalSection heading="15. Changes to these Terms">
        <p>
          We may update these Terms from time to time. If we make material changes, we will update the
          &ldquo;Last updated&rdquo; date above and, where appropriate, notify you. Your continued use
          of the Service after changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection heading="16. Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:legal@helixstudio.org" className="text-accent hover:underline">
            legal@helixstudio.org
          </a>
          . See also our{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
