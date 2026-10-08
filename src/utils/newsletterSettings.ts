type NewsletterInput = {
  action?: string;
  provider?: string;
  privacyURL?: string;
  contactEmail?: string;
};

export function getNewsletterSettings(input: NewsletterInput) {
  const action = input.action?.trim() ?? "";
  const provider = input.provider?.trim() ?? "";
  const privacyURL = input.privacyURL?.trim() ?? "";
  const contactEmail = input.contactEmail?.trim() ?? "";
  for (const value of [action, privacyURL]) {
    if (value && new URL(value).protocol !== "https:") {
      throw new Error("Newsletter URLs must use HTTPS.");
    }
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new Error("Newsletter contact email is invalid.");
  }
  return {
    action,
    provider,
    privacyURL,
    contactEmail,
    enabled: Boolean(action && provider && privacyURL && contactEmail),
  };
}
