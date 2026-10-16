import assert from "node:assert/strict";
import test from "node:test";
import { isPublished, isPublicWork } from "./publication.ts";
import { selectLocalizedEntries } from "../i18n/routing.ts";

const now = Date.parse("2026-10-06T12:00:00Z");
const data = { pubDatetime: new Date(now + 60_000) };

test("schedules honor the publication boundary and configured margin", () => {
  assert.equal(isPublished(data, { now }), false);
  assert.equal(isPublished(data, { now, margin: 59_999 }), false);
  assert.equal(isPublished(data, { now, margin: 60_000 }), true);
  assert.equal(isPublished(data, { now: now + 60_000 }), true);
});

test("development previews future entries without exposing drafts", () => {
  assert.equal(isPublished(data, { now, development: true }), true);
  assert.equal(
    isPublished({ ...data, draft: true }, { development: true }),
    false
  );
  assert.equal(isPublicWork({ ...data, template: true }), false);
  assert.equal(isPublicWork(data), true);
});

test("a scheduled translation cannot displace an available article or video", () => {
  const english = {
    id: "example",
    data: { lang: "en", pubDatetime: new Date(now) },
  };
  const chinese = { id: "zh/example", data: { lang: "zh", ...data } };
  const eligible = [chinese, english].filter(entry =>
    isPublished(entry.data, { now })
  );
  assert.deepEqual(selectLocalizedEntries(eligible, "zh"), [english]);
});
