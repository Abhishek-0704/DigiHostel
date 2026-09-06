/**
 * Legal content (Prompt 11). No approved legal document exists anywhere in
 * this repository's documentation — every entry below is explicitly
 * `isPlaceholder: true` with clearly-labeled placeholder text, never
 * presented as an approved institutional policy, per this prompt's
 * explicit instruction. Replacing a placeholder with a real, approved
 * document is a content-only change — `LegalDocument`'s shape does not
 * need to change.
 */
export interface LegalDocument {
  id: string;
  title: string;
  isPlaceholder: boolean;
  body: string;
}

const PLACEHOLDER_NOTICE =
  "This is placeholder text only. DigiHostel's final, approved version of this document is not yet available.";

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    id: "terms-of-service",
    title: "Terms of Service",
    isPlaceholder: true,
    body: `${PLACEHOLDER_NOTICE}\n\nThis document will describe the rules for using the DigiHostel Parent application.`,
  },
  {
    id: "privacy-policy",
    title: "Privacy Policy",
    isPlaceholder: true,
    body: `${PLACEHOLDER_NOTICE}\n\nSee Settings → Privacy for a plain-language summary of current data practices.`,
  },
  {
    id: "data-protection",
    title: "Data Protection Information",
    isPlaceholder: true,
    body: `${PLACEHOLDER_NOTICE}\n\nThis document will describe how DigiHostel protects your personal data in more detail.`,
  },
  {
    id: "user-agreement",
    title: "User Agreement",
    isPlaceholder: true,
    body: `${PLACEHOLDER_NOTICE}\n\nThis document will describe the agreement between you and your institution regarding use of this application.`,
  },
  {
    id: "open-source-licenses",
    title: "Open Source Licenses",
    isPlaceholder: true,
    body: `${PLACEHOLDER_NOTICE}\n\nA full list of open-source software used by this application will be published here.`,
  },
];
