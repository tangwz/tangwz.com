import assert from "node:assert/strict";
import test from "node:test";
import { resolveGoogleAnalyticsId } from "./googleAnalytics.ts";

test("analytics stays disabled when its measurement ID is omitted or blank", () => {
  for (const value of [undefined, "", "  "]) {
    assert.equal(resolveGoogleAnalyticsId(value), undefined);
  }
});

test("GA4 IDs are accepted and surrounding whitespace is removed", () => {
  assert.equal(resolveGoogleAnalyticsId("G-ABC1234567"), "G-ABC1234567");
  assert.equal(resolveGoogleAnalyticsId("  G-ABC1234567  "), "G-ABC1234567");
});

test("invalid IDs fail configuration instead of loading a broken or unsafe tag", () => {
  for (const id of [
    "G-",
    "UA-123456-1",
    "GTM-ABC123",
    "G-abc123",
    "G-ABC 123",
    "G-ABC&other=value",
    'G-ABC\"</script>',
  ]) {
    assert.throws(() => resolveGoogleAnalyticsId(id), /GA4 measurement ID/);
  }
});
