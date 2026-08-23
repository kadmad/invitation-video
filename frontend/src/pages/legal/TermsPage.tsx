import { Link } from "react-router-dom";
import LegalLayout, { LegalSection } from "./LegalLayout";
import { useSeo } from "@/lib/seo";
import {
  DOWNLOAD_RETENTION_DAYS,
  GRIEVANCE_OFFICER,
  LEGAL_ADDRESS,
  LEGAL_ENTITY,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_JURISDICTION,
  SITE_DOMAIN,
  SITE_NAME,
  SITE_URL,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from "@/lib/site";

const sections: LegalSection[] = [
  {
    id: "acceptance",
    heading: "Acceptance of these Terms",
    body: (
      <>
        <p>
          These Terms &amp; Conditions ("Terms") are a binding agreement between you and {LEGAL_ENTITY} ("
          {SITE_NAME}", "we", "us"), operator of {SITE_DOMAIN}. By creating an account, ticking the consent
          checkbox at sign-up, customising a template, or paying for a download, you confirm that you have read and
          accepted these Terms and our <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          If you do not agree with any part of these Terms, please do not use the service. These Terms are published
          in electronic form under the Information Technology Act, 2000 and the rules made under it, and do not
          require a physical or digital signature.
        </p>
      </>
    ),
  },
  {
    id: "eligibility",
    heading: "Eligibility",
    body: (
      <>
        <p>
          You must be at least 18 years old and competent to contract under the Indian Contract Act, 1872 to hold an
          account. If you create an invitation that names or shows a minor, you confirm that you are their parent or
          legal guardian, or that you have that person's permission.
        </p>
        <p>
          You may use the service only where doing so is lawful in your location. You are responsible for any taxes,
          duties or charges that apply to you locally.
        </p>
      </>
    ),
  },
  {
    id: "account",
    heading: "Your account and mobile OTP login",
    body: (
      <>
        <p>
          We sign you in with a one-time password (OTP) sent to your mobile number. You are responsible for keeping
          access to that number and to any device where you stay signed in. Anything done from your account is treated
          as done by you.
        </p>
        <ul>
          <li>Give an accurate mobile number that belongs to you — OTPs and delivery messages go to it.</li>
          <li>Do not share your OTP with anyone, including anyone claiming to be from {SITE_NAME}.</li>
          <li>Tell us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if you suspect unauthorised use.</li>
          <li>One person should not run multiple accounts to abuse free previews, offers or credits.</li>
        </ul>
      </>
    ),
  },
  {
    id: "service",
    heading: "What the service does",
    body: (
      <>
        <p>
          {SITE_NAME} lets you pick a designed template for weddings, engagements, birthdays, housewarmings and
          similar occasions, fill in your own names, dates, venues and photos, preview the result in your browser, and
          — after payment — download a rendered video and, where offered, a matching PDF card.
        </p>
        <p>
          Previews may carry a watermark, run at reduced quality, or omit fonts and effects present in the final
          render. The paid download is the deliverable; the preview is an indication only.
        </p>
        <p>
          Optional helpers such as name transliteration into Indian scripts and auto-generated venue location maps are
          convenience features. <strong>Always proof-read the preview before you pay</strong> — machine
          transliteration and map placement can be wrong.
        </p>
      </>
    ),
  },
  {
    id: "your-content",
    heading: "Your content and the licence you give us",
    body: (
      <>
        <p>
          "Your Content" means everything you enter or upload: names, event details, phone numbers, addresses, photos,
          logos and messages. <strong>You keep ownership of Your Content.</strong>
        </p>
        <p>
          You grant us a limited, non-exclusive, royalty-free, worldwide licence to store, reproduce, resize, encode
          and display Your Content strictly in order to render, deliver and support your invitation. This licence ends
          when you delete the draft or your account, except for copies we must keep for tax, accounting or legal
          reasons.
        </p>
        <p>You confirm that you have the right to use Your Content, and that it does not:</p>
        <ul>
          <li>infringe anyone's copyright, trademark, privacy or publicity rights;</li>
          <li>show an identifiable person who has not agreed to appear on your invitation;</li>
          <li>break any Indian law, including the IT Act, 2000 and the rules made under it.</li>
        </ul>
        <p>
          We do not use Your Content for marketing, showcases or template samples without asking you first.
        </p>
      </>
    ),
  },
  {
    id: "our-content",
    heading: "Our templates, fonts and intellectual property",
    body: (
      <>
        <p>
          All templates, animations, layouts, artwork, music, code and the {SITE_NAME} name and logo are owned by us
          or licensed to us. Paying for a render buys you a licence to use <em>your personalised output</em> — not the
          template itself.
        </p>
        <p>You may:</p>
        <ul>
          <li>share, print, broadcast and post your rendered video and card for your own event, including on WhatsApp and social media;</li>
          <li>keep your own backup copies.</li>
        </ul>
        <p>You may not:</p>
        <ul>
          <li>resell, sub-licence, redistribute or bundle our templates or your render as stock or template content;</li>
          <li>use our templates to run a competing invitation-making service;</li>
          <li>scrape, download in bulk, reverse-engineer, or extract the template designs, fonts or source files;</li>
          <li>remove or obscure watermarks from unpaid previews.</li>
        </ul>
        <p>
          Fonts shipped with templates are licensed to us by their foundries for use inside renders. That licence does
          not pass to you as a standalone font licence.
        </p>
      </>
    ),
  },
  {
    id: "pricing",
    heading: "Pricing, payment and invoices",
    body: (
      <>
        <p>
          Prices are shown in Indian Rupees (₹) on the checkout screen before you pay and include applicable taxes
          unless stated otherwise. The price displayed at the moment of payment is the price that applies; we may
          revise prices at any time for future orders.
        </p>
        <p>
          Payments are collected by Razorpay. We never see or store your full card number, UPI PIN, CVV or net-banking
          credentials — those go directly to the payment gateway. We store only the transaction reference, amount,
          status and the invoice details we are required to keep.
        </p>
        <p>
          An order is confirmed only after the gateway reports a successful, verified payment. If money leaves your
          account but the order does not confirm, contact us with the transaction reference and we will trace or
          refund it.
        </p>
      </>
    ),
  },
  {
    id: "delivery",
    heading: "Rendering, delivery and download period",
    body: (
      <>
        <p>
          Rendering starts after payment is verified and normally finishes within a few minutes, though queue length,
          video duration and template complexity can make it longer. We will notify you in the app, and on WhatsApp
          where you have opted in, when the download is ready.
        </p>
        <p>
          Download links stay available for at least {DOWNLOAD_RETENTION_DAYS} days from delivery. Please download and
          keep your own copy — we may remove rendered files after that period, and we do not guarantee that we can
          re-issue a render once it has been purged.
        </p>
        <p>
          Delivery over WhatsApp depends on Meta and our messaging provider and is not guaranteed. The in-app download
          is the primary delivery method.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <>
        <p>You agree not to use {SITE_NAME} to create, store or share anything that:</p>
        <ul>
          <li>is unlawful, obscene, defamatory, hateful, or promotes violence or discrimination;</li>
          <li>impersonates another person or misrepresents an event, organisation or affiliation;</li>
          <li>invites people to an unlawful gathering, a fraudulent scheme, or gambling where prohibited;</li>
          <li>contains malware, or is used to phish, spam or harvest other people's data;</li>
          <li>overloads, probes, or attempts to gain unauthorised access to our systems, rendering queues or storage.</li>
        </ul>
        <p>
          We may remove content or suspend an account that breaches this section, and we will cooperate with lawful
          requests from Indian authorities.
        </p>
      </>
    ),
  },
  {
    id: "third-parties",
    heading: "Third-party services",
    body: (
      <>
        <p>
          The service depends on third parties, including Razorpay for payments, WhatsApp Business messaging for
          delivery notifications, cloud hosting and object storage for files, and map data providers for venue maps.
          Their availability and terms are outside our control, and outages on their side may delay or interrupt the
          service.
        </p>
        <p>
          Where your invitation shows a location map, the map data is supplied by third-party sources and is
          indicative only. Check the address and directions yourself before sharing.
        </p>
      </>
    ),
  },
  {
    id: "refunds",
    heading: "Refunds and cancellations",
    body: (
      <>
        <p>
          Refunds are governed by our <Link to="/refund">Refund &amp; Cancellation Policy</Link>, which forms part of
          these Terms. In short: because a render is a digital good produced to your specification, a completed and
          delivered render is generally non-refundable, but we refund failed renders, duplicate charges and payments
          that we could not fulfil.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    heading: "Availability and changes to the service",
    body: (
      <>
        <p>
          We aim to keep {SITE_NAME} available, but we do not promise uninterrupted service. We may add, change,
          suspend or withdraw templates, features, pricing tiers or the service itself, and we may carry out
          maintenance with or without notice.
        </p>
        <p>
          Templates are occasionally retired or updated. A draft that references a retired template may no longer be
          renderable; we will tell you if that affects a paid order and refund it if we cannot deliver.
        </p>
      </>
    ),
  },
  {
    id: "disclaimer",
    heading: "Disclaimers",
    body: (
      <>
        <p>
          The service is provided "as is" and "as available". To the maximum extent permitted by law, we disclaim all
          implied warranties of merchantability, fitness for a particular purpose and non-infringement.
        </p>
        <p>
          We do not warrant that templates will suit a particular ceremony or custom, that transliteration or maps
          will be accurate, that output will render identically on every device or messaging app, or that the service
          will be free of errors.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    body: (
      <>
        <p>
          To the extent permitted by law, we are not liable for indirect, incidental, special or consequential loss,
          loss of profit or goodwill, loss of data, or any cost arising from an event that did not go as planned —
          including a guest who missed an invitation, a typo in a date or venue, or a delayed delivery.
        </p>
        <p>
          Our total aggregate liability for any claim relating to the service is limited to the amount you paid us for
          the specific order that gave rise to the claim.
        </p>
        <p>Nothing here excludes liability that cannot lawfully be excluded, including for fraud.</p>
      </>
    ),
  },
  {
    id: "indemnity",
    heading: "Indemnity",
    body: (
      <p>
        You agree to indemnify and hold {LEGAL_ENTITY}, its team and its service providers harmless against claims,
        damages, penalties and reasonable legal costs arising from Your Content, your breach of these Terms, or your
        infringement of someone else's rights.
      </p>
    ),
  },
  {
    id: "termination",
    heading: "Suspension and termination",
    body: (
      <>
        <p>
          You may stop using the service at any time and ask us to delete your account. We may suspend or terminate an
          account that breaches these Terms, is used fraudulently, or exposes us or other users to legal risk.
        </p>
        <p>
          On termination your drafts and undelivered renders may be deleted. Paid renders already delivered remain
          yours to use under the licence in section 6.
        </p>
      </>
    ),
  },
  {
    id: "grievance",
    heading: "Grievance redressal",
    body: (
      <>
        <p>
          In line with the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021,
          complaints about content or the service can be sent to our {GRIEVANCE_OFFICER}:
        </p>
        <ul>
          <li>
            Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </li>
          <li>Address: {LEGAL_ADDRESS}</li>
        </ul>
        <p>
          We acknowledge complaints within 24 hours and aim to resolve them within 15 days of receipt.
        </p>
      </>
    ),
  },
  {
    id: "governing-law",
    heading: "Governing law and jurisdiction",
    body: (
      <p>
        These Terms are governed by the laws of India. The courts at {LEGAL_JURISDICTION} have exclusive jurisdiction
        over any dispute, subject to any consumer rights you have to bring a claim where you live.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms. The version number and effective date at the top of this page always show the
        current version, and material changes will be flagged in the app or by message. Continuing to use{" "}
        {SITE_NAME} after a change means you accept the updated Terms.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "Contact us",
    body: (
      <>
        <p>
          {LEGAL_ENTITY}
          <br />
          {LEGAL_ADDRESS}
          <br />
          Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <br />
          Phone: <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}>{SUPPORT_PHONE}</a>
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  useSeo({
    title: `Terms & Conditions`,
    description: `Terms & Conditions for ${SITE_NAME} (${SITE_DOMAIN}) — accounts, content licence, pricing, delivery, refunds and liability for our online video invitation maker.`,
    path: "/terms",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `Terms & Conditions | ${SITE_NAME}`,
      url: `${SITE_URL}/terms`,
      dateModified: "2026-08-15",
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
  });

  return (
    <LegalLayout
      title="Terms & Conditions"
      intro={
        <p>
          Please read these Terms before using {SITE_NAME}. They cover how you may use our templates, what happens to
          the content you upload, how payment and delivery work, and the limits of our responsibility. They apply from{" "}
          {LEGAL_EFFECTIVE_DATE}.
        </p>
      }
      sections={sections}
    />
  );
}
