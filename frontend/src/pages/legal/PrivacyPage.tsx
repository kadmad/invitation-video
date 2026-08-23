import { Link } from "react-router-dom";
import LegalLayout, { LegalSection } from "./LegalLayout";
import { useSeo } from "@/lib/seo";
import {
  DOWNLOAD_RETENTION_DAYS,
  GRIEVANCE_OFFICER,
  LEGAL_ADDRESS,
  LEGAL_ENTITY,
  LEGAL_EFFECTIVE_DATE,
  PRIVACY_EMAIL,
  SITE_DOMAIN,
  SITE_NAME,
  SITE_URL,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from "@/lib/site";

const sections: LegalSection[] = [
  {
    id: "scope",
    heading: "Scope of this policy",
    body: (
      <>
        <p>
          This Privacy Policy explains what personal data {LEGAL_ENTITY} ("{SITE_NAME}", "we", "us") collects when you
          use {SITE_DOMAIN}, why we collect it, who we share it with, and the choices you have. It applies to visitors,
          registered users, and the people whose details appear on an invitation you create.
        </p>
        <p>
          We handle personal data in line with the Digital Personal Data Protection Act, 2023 (DPDP Act) and the
          Information Technology Act, 2000 and its rules. Where the General Data Protection Regulation (GDPR) applies
          to you, section 11 sets out the extra rights you have.
        </p>
        <p>
          This policy should be read together with our <Link to="/terms">Terms &amp; Conditions</Link>.
        </p>
      </>
    ),
  },
  {
    id: "data-we-collect",
    heading: "Data we collect",
    body: (
      <>
        <p>
          <strong>Account data.</strong> Your mobile number, which we use to send a one-time password (OTP) and to
          sign you in, and the display name on your account. We do not ask for a password for phone sign-in.
        </p>
        <p>
          <strong>Invitation content.</strong> Everything you type or upload into a draft — names of the couple,
          families and guests, event dates and times, venue names and addresses, contact numbers you print on the
          card, personal messages, and photos. This can include data about people other than you.
        </p>
        <p>
          <strong>Order and payment data.</strong> The template ordered, amount, currency, order and invoice numbers,
          payment status and the gateway's transaction reference. <strong>We never receive or store your card
          number, CVV, UPI PIN or net-banking credentials</strong> — those are collected directly by Razorpay on its
          own systems.
        </p>
        <p>
          <strong>Output files.</strong> The rendered video and PDF produced from your draft, held in our object
          storage so you can download them.
        </p>
        <p>
          <strong>Technical and usage data.</strong> IP address, browser and device type, pages and templates viewed,
          render and error logs, and timestamps. We use this to run, secure and improve the service.
        </p>
        <p>
          <strong>Support data.</strong> Messages you send us by email or WhatsApp, and our replies.
        </p>
        <p>We do not knowingly collect sensitive data such as caste, religion, health or biometric information. Please do not put such details into an invitation beyond what the occasion obviously requires.</p>
      </>
    ),
  },
  {
    id: "how-we-use",
    heading: "How we use your data",
    body: (
      <ul>
        <li>To create your account and sign you in with an OTP.</li>
        <li>To save your drafts, render your video and card, and let you download them.</li>
        <li>To take payment through Razorpay, issue invoices and keep tax records.</li>
        <li>To send you service messages — OTPs, "your render is ready", and delivery links — by SMS or WhatsApp.</li>
        <li>To answer support requests and resolve disputes and chargebacks.</li>
        <li>To detect and prevent fraud, abuse of free previews, and attacks on our systems.</li>
        <li>To understand which templates and features are used, in aggregate, so we can improve them.</li>
        <li>To comply with law and respond to lawful requests from authorities.</li>
      </ul>
    ),
  },
  {
    id: "legal-basis",
    heading: "Consent and our basis for processing",
    body: (
      <>
        <p>
          Under the DPDP Act we process your data on the basis of the consent you give when you tick the agreement
          checkbox at sign-up, and for the "legitimate uses" the Act allows — chiefly performing the service you asked
          for, meeting legal obligations, and preventing fraud.
        </p>
        <p>
          <strong>Consent for other people's data.</strong> When you enter a guest's name, phone number or photo, you
          act as the person deciding to share it. You confirm that you have their permission to do so, and that they
          are aware the details will appear on an invitation you distribute.
        </p>
        <p>
          You can withdraw consent at any time by writing to{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Withdrawal is not retroactive and may mean we can
          no longer run your account or re-issue past renders.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    heading: "Who we share data with",
    body: (
      <>
        <p>
          <strong>We do not sell your personal data, and we do not use your invitation content for advertising.</strong>{" "}
          We share data only with processors who help us run the service, under contract and only for that purpose:
        </p>
        <ul>
          <li>
            <strong>Razorpay</strong> — payment processing, refunds and chargebacks.
          </li>
          <li>
            <strong>Messaging providers (WhatsApp Business / SMS gateways)</strong> — sending OTPs and delivery
            notifications to your mobile number.
          </li>
          <li>
            <strong>Cloud hosting and object storage</strong> — running the application, database, render queue and
            file downloads.
          </li>
          <li>
            <strong>Map data providers</strong> — generating the venue location map when you add one. We send the
            address or coordinates you entered, not your identity.
          </li>
          <li>
            <strong>Analytics and error monitoring</strong> — aggregate usage and crash diagnostics.
          </li>
        </ul>
        <p>
          We may also disclose data where the law requires it, to enforce our <Link to="/terms">Terms</Link>, or as
          part of a merger or acquisition — in which case you will be told before your data moves to a new controller.
        </p>
      </>
    ),
  },
  {
    id: "sharing-by-you",
    heading: "Invitations you share are public",
    body: (
      <p>
        Once you download an invitation and send it on WhatsApp or social media, its contents — names, dates, venue,
        photos and any phone numbers printed on it — travel with it and are outside our control. Think carefully
        before printing a home address or personal number on a card you will forward widely.
      </p>
    ),
  },
  {
    id: "cookies",
    heading: "Cookies and local storage",
    body: (
      <>
        <p>
          We use browser local storage to keep you signed in (your session token) and to hold unsaved draft edits.
          These are essential — the service cannot work without them.
        </p>
        <p>
          We may also use analytics cookies to count visits and see which templates are popular. You can clear or
          block storage and cookies in your browser settings; signing in will then stop working.
        </p>
        <p>We do not run third-party advertising or cross-site tracking cookies.</p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "How long we keep data",
    body: (
      <ul>
        <li>
          <strong>Drafts</strong> — until you delete them or delete your account.
        </li>
        <li>
          <strong>Rendered files</strong> — at least {DOWNLOAD_RETENTION_DAYS} days from delivery, after which they may
          be purged from storage.
        </li>
        <li>
          <strong>Account data</strong> — while your account is active.
        </li>
        <li>
          <strong>Invoices and payment records</strong> — as long as Indian tax and accounting law requires (generally
          up to 8 years), even after you close your account.
        </li>
        <li>
          <strong>Logs</strong> — typically up to 12 months, for security and debugging.
        </li>
      </ul>
    ),
  },
  {
    id: "security",
    heading: "Security",
    body: (
      <>
        <p>
          We protect data with HTTPS in transit, access-controlled storage, signed and expiring download links,
          short-lived OTPs with rate limiting, and role-based access for the small number of staff who need it.
        </p>
        <p>
          No system is completely secure. If a breach affects your personal data, we will notify you and the Data
          Protection Board of India as required by the DPDP Act.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    heading: "Your rights",
    body: (
      <>
        <p>Subject to law, you can ask us to:</p>
        <ul>
          <li>tell you what personal data of yours we hold and who we have shared it with;</li>
          <li>correct or complete data that is wrong or out of date;</li>
          <li>erase data we no longer need for the purpose it was collected for;</li>
          <li>stop processing based on consent, by withdrawing it;</li>
          <li>nominate someone to exercise these rights if you die or become incapacitated, as the DPDP Act allows.</li>
        </ul>
        <p>
          Write to <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> from the email or mobile number on your
          account. We respond within 30 days. We may keep data we are legally required to retain, such as invoices.
        </p>
      </>
    ),
  },
  {
    id: "international",
    heading: "Where your data is processed",
    body: (
      <p>
        We operate from India and prefer Indian data centres. Some processors — messaging, analytics and error
        monitoring in particular — may process data on servers outside India. Where that happens we rely on contracts
        with those providers and transfer data only to countries not restricted by the Government of India. For users
        in the European Economic Area or the UK, transfers are made under Standard Contractual Clauses or an
        equivalent safeguard, and GDPR rights of access, portability, restriction and objection apply in addition to
        section 10.
      </p>
    ),
  },
  {
    id: "children",
    heading: "Children's data",
    body: (
      <p>
        Accounts are for adults aged 18 and over. We do not knowingly create accounts for children. If an invitation
        names or shows a child — a naming ceremony or birthday, for example — you confirm you are the parent or
        guardian, or have their consent, as the DPDP Act requires for processing a child's data. If you believe a
        child has given us data directly, contact <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> and we will
        delete it.
      </p>
    ),
  },
  {
    id: "third-party-links",
    heading: "Third-party links",
    body: (
      <p>
        Our pages and your invitations may link to other sites — a venue's page, a map, or a social network. We are
        not responsible for their privacy practices. Read their policies before giving them your data.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        We may update this policy as the service or the law changes. The version and effective date at the top of the
        page show the current text, and material changes will be notified in the app or by message before they take
        effect.
      </p>
    ),
  },
  {
    id: "grievance",
    heading: "Grievance Officer and contact",
    body: (
      <>
        <p>
          For any question, request or complaint about your personal data, contact our {GRIEVANCE_OFFICER} — the
          Data Protection Officer for the purposes of the DPDP Act:
        </p>
        <ul>
          <li>
            Email: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>
          </li>
          <li>
            General support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </li>
          <li>
            Phone: <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}>{SUPPORT_PHONE}</a>
          </li>
          <li>
            {LEGAL_ENTITY}, {LEGAL_ADDRESS}
          </li>
        </ul>
        <p>
          We acknowledge complaints within 24 hours and aim to resolve them within 15 days. If you are not satisfied,
          you may complain to the Data Protection Board of India.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  useSeo({
    title: "Privacy Policy",
    description: `How ${SITE_NAME} (${SITE_DOMAIN}) collects, uses, shares and protects your data — mobile OTP login, invitation photos and details, payments, retention and your rights under India's DPDP Act, 2023.`,
    path: "/privacy",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `Privacy Policy | ${SITE_NAME}`,
      url: `${SITE_URL}/privacy`,
      dateModified: "2026-08-15",
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
  });

  return (
    <LegalLayout
      title="Privacy Policy"
      intro={
        <p>
          Your invitation carries your family's names, photos and addresses, so we keep the data rules simple: we
          collect what the service needs, we do not sell it, and you can ask for it back or ask us to delete it. This
          policy applies from {LEGAL_EFFECTIVE_DATE}.
        </p>
      }
      sections={sections}
    />
  );
}
