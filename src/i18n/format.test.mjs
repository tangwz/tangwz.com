import assert from "node:assert/strict";
import test from "node:test";
import { formatDateInTimezone } from "./format.ts";

test("article dates honor timezones on either side of a day boundary", () => {
  const date = new Date("2026-10-01T00:30:00Z");
  assert.equal(
    formatDateInTimezone(date, "en", "long", "America/Los_Angeles"),
    "September 30, 2026"
  );
  assert.equal(
    formatDateInTimezone(date, "en", "long", "Asia/Shanghai"),
    "October 1, 2026"
  );
});

test("card and article month styles keep the same localized calendar date", () => {
  const date = new Date("2026-10-01T00:30:00Z");
  assert.equal(
    formatDateInTimezone(date, "en", "short", "America/Los_Angeles"),
    "Sep 30, 2026"
  );
  const expected = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(date);
  assert.equal(
    formatDateInTimezone(date, "zh", "long", "America/Los_Angeles"),
    expected
  );
});
