import { Link } from "react-router-dom";
import LegalLayout, { LegalSection } from "./LegalLayout";
import { useSeo } from "@/lib/seo";
import {
  LEGAL_EFFECTIVE_DATE,
  SITE_DOMAIN,
  SITE_NAME,
  SITE_URL,
  SUPPORT_EMAIL,
} from "@/lib/site";

const sections: LegalSection[] = [
  {
    id: "digital-goods",
    heading: "Renders are made to order",
    body: (
      <p>
        Every video and PDF card is generated from the exact text, photos and template you chose, so it cannot be
        restocked or resold. Once a render has completed and the download is available, the order is treated as
        fulfilled and is generally <strong>not refundable</strong>. Please preview your invitation carefully before
        paying — the free preview shows every screen of the final video.
      </p>
    ),
  },
  {
    id: "when-we-refund",
    heading: "When we do refund",
    body: (
      <>
        <p>We refund the full amount paid when:</p>
        <ul>
          <li>the render failed and we cannot produce a working file;</li>
          <li>you were charged more than once for the same order;</li>
          <li>money was debited but the order never confirmed on our side;</li>
          <li>the delivered file is corrupt, incomplete, or does not match the template you paid for, and we cannot fix it;</li>
          <li>we withdrew or retired the template before delivering your paid render.</li>
        </ul>
      </>
    ),
  },
  {
    id: "when-we-dont",
    heading: "When we cannot refund",
    body: (
      <ul>
        <li>Typos, wrong dates, wrong names or wrong venue that you entered and approved in the preview.</li>
        <li>Change of mind, a cancelled or postponed event, or picking a different template afterwards.</li>
        <li>Low-resolution or badly cropped photos that you uploaded.</li>
        <li>Transliteration into an Indian script that you approved in the preview but later want changed.</li>
        <li>A file that plays correctly but looks different after a messaging app has compressed it.</li>
      </ul>
    ),
  },
  {
    id: "corrections",
    heading: "Corrections instead of refunds",
    body: (
      <p>
        If you spot a mistake soon after paying, write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with
        your order number. Where the render has not started, or as a one-time goodwill gesture, we will usually
        re-render the corrected invitation free of charge rather than refund it.
      </p>
    ),
  },
  {
    id: "how-to-request",
    heading: "How to request a refund",
    body: (
      <>
        <p>
          Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> within <strong>7 days</strong> of payment with:
        </p>
        <ul>
          <li>your order or invoice number;</li>
          <li>the mobile number on your account;</li>
          <li>the payment reference from Razorpay or your bank;</li>
          <li>what went wrong, with a screenshot or the file if relevant.</li>
        </ul>
      </>
    ),
  },
  {
    id: "timelines",
    heading: "Processing time",
    body: (
      <p>
        We review requests within 3 working days. Approved refunds are issued to the original payment method through
        Razorpay and typically reach your bank, card or UPI account within 5–10 working days, depending on your bank.
        We do not refund to a different account or in cash.
      </p>
    ),
  },
  {
    id: "disputes",
    heading: "Disputes",
    body: (
      <p>
        Please contact us before raising a chargeback — it is faster. Unresolved disputes are handled under the
        grievance and governing-law sections of our <Link to="/terms">Terms &amp; Conditions</Link>.
      </p>
    ),
  },
];

export default function RefundPage() {
  useSeo({
    title: "Refund & Cancellation Policy",
    description: `Refund and cancellation rules for ${SITE_NAME} (${SITE_DOMAIN}) — when a paid invitation video render is refundable, how to request a refund, and how long it takes.`,
    path: "/refund",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `Refund & Cancellation Policy | ${SITE_NAME}`,
      url: `${SITE_URL}/refund`,
      dateModified: "2026-08-15",
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
  });

  return (
    <LegalLayout
      title="Refund & Cancellation Policy"
      intro={
        <p>
          This policy explains when a payment made on {SITE_NAME} can be refunded. It forms part of our{" "}
          <Link to="/terms">Terms &amp; Conditions</Link> and applies from {LEGAL_EFFECTIVE_DATE}.
        </p>
      }
      sections={sections}
    />
  );
}
