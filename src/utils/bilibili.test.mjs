import assert from "node:assert/strict";
import test from "node:test";
import { resolveBilibiliVideo } from "./bilibili.ts";

test("BV identifiers produce a non-autoplaying official player", () => {
  const video = resolveBilibiliVideo("BV1B7411m7LV");
  assert.equal(video.watchUrl, "https://www.bilibili.com/video/BV1B7411m7LV/");
  const player = new URL(video.embedUrl);
  assert.equal(player.origin, "https://player.bilibili.com");
  assert.equal(player.searchParams.get("bvid"), "BV1B7411m7LV");
  assert.equal(player.searchParams.get("p"), "1");
  assert.equal(player.searchParams.get("autoplay"), "0");
});

test("video links preserve the selected part and discard tracking parameters", () => {
  const video = resolveBilibiliVideo(
    "https://www.bilibili.com/video/BV1B7411m7LV/?p=3&spm_id_from=example"
  );
  assert.equal(
    video.watchUrl,
    "https://www.bilibili.com/video/BV1B7411m7LV/?p=3"
  );
  assert.equal(new URL(video.embedUrl).searchParams.get("p"), "3");
});

test("AV and mobile links use the official player", () => {
  assert.equal(
    new URL(resolveBilibiliVideo("av12345").embedUrl).searchParams.get("aid"),
    "12345"
  );
  assert.ok(resolveBilibiliVideo("https://m.bilibili.com/video/BV1B7411m7LV"));
  assert.ok(
    resolveBilibiliVideo("https://www.bilibili.com/s/video/BV1B7411m7LV/")
  );
});

test("short share links remain external links until resolved to a full video URL", () => {
  assert.deepEqual(resolveBilibiliVideo("https://b23.tv/abc123"), {
    watchUrl: "https://b23.tv/abc123",
    embedUrl: null,
  });
});

test("invalid or unrelated links cannot become player URLs", () => {
  for (const value of [
    "",
    "javascript:alert(1)",
    "https://example.com/video/BV1B7411m7LV",
    "https://www.bilibili.com.evil.example/video/BV1B7411m7LV",
    "http://www.bilibili.com/video/BV1B7411m7LV",
    "https://user:pass@www.bilibili.com/video/BV1B7411m7LV",
    "BV123",
    "av0",
    "https://www.bilibili.com/video/BV1B7411m7LV?p=0",
    "https://www.bilibili.com/video/BV1B7411m7LV?p=-1",
    "https://www.bilibili.com/video/BV1B7411m7LV?p=1.5",
    "https://www.bilibili.com/video/BV1B7411m7LV?p=99999999999999999999",
  ]) {
    assert.equal(resolveBilibiliVideo(value), null, value);
  }
});
