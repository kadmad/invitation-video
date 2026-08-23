/**
 * Single source of truth for brand, legal and contact details.
 * Update the placeholders marked TODO before going live — they appear
 * verbatim in the Terms, Privacy Policy and Refund pages.
 */

export const SITE_NAME = "Bring My Matter";
export const SITE_DOMAIN = "bringmymatter.com";
export const SITE_URL = "https://bringmymatter.com";

export const SITE_TAGLINE = "Video invitations for every Indian celebration";
export const SITE_DESCRIPTION =
  "Create wedding, engagement, birthday and housewarming video invitations online. Pick a template, add your names, dates and photos in English, Hindi or Gujarati, and download an HD video and PDF card in minutes.";

/** Legal entity operating the service. */
export const LEGAL_ENTITY = "Bring My Matter"; // TODO: registered company / proprietorship name
export const LEGAL_ADDRESS = "2, Dhirajlal & Sons, Near Shahpur Gate, Shahpur Cross Road, Shahpur - 380001";
export const LEGAL_JURISDICTION = "Ahmedabad, Gujarat, India"; // TODO: courts of exclusive jurisdiction

export const SUPPORT_EMAIL = "support@bringmymatter.com";
export const PRIVACY_EMAIL = "privacy@bringmymatter.com";
export const GRIEVANCE_OFFICER = "Grievance Officer"; // TODO: named officer, required by DPDP Act 2023
export const SUPPORT_PHONE = "+91 63515 36569";

/**
 * Version of the Terms & Privacy Policy the signup checkbox records consent
 * against. Bump this (and LEGAL_EFFECTIVE_DATE) whenever the documents change
 * materially — it must match backend `TERMS_VERSION`.
 */
export const LEGAL_VERSION = "2026-08-15";
export const LEGAL_EFFECTIVE_DATE = "15 August 2026";

/** How long rendered videos / cards stay downloadable. Quoted in the Terms. */
export const DOWNLOAD_RETENTION_DAYS = 90;
