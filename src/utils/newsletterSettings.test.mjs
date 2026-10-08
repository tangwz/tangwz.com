import assert from "node:assert/strict";
import test from "node:test";
import { getNewsletterSettings } from "./newsletterSettings.ts";

const complete = {
  action: "https://mail.example.com/subscribe",
  provider: "Example Mail",
  privacyURL: "https://mail.example.com/privacy",
  contactEmail: "hello@example.com",
};

test("subscriptions stay closed until the provider and privacy details are configured", () => {
  assert.equal(getNewsletterSettings({}).enabled, false);
  assert.equal(
    getNewsletterSettings({ action: complete.action }).enabled,
    false
  );
  for (const key of Object.keys(complete)) {
    assert.equal(
      getNewsletterSettings({ ...complete, [key]: "" }).enabled,
      false
    );
  }
  assert.equal(getNewsletterSettings(complete).enabled, true);
});

test("public endpoints require HTTPS and a valid contact address", () => {
  assert.throws(() =>
    getNewsletterSettings({ ...complete, action: "javascript:alert(1)" })
  );
  assert.throws(() =>
    getNewsletterSettings({
      ...complete,
      privacyURL: "http://mail.example.com/privacy",
    })
  );
  assert.throws(() =>
    getNewsletterSettings({ ...complete, contactEmail: "invalid" })
  );
  assert.equal(
    getNewsletterSettings({ ...complete, provider: "  Example Mail  " })
      .provider,
    "Example Mail"
  );
});
