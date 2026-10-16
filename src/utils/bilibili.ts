type BilibiliVideo = { watchUrl: string; embedUrl: string | null };
const bvPattern = /^BV[0-9A-Za-z]{10}$/;
const avPattern = /^av([1-9]\d*)$/i;

export function resolveBilibiliVideo(input: string): BilibiliVideo | null {
  const value = input.trim();
  let identifier = value;
  let part = 1;
  if (!bvPattern.test(value) && !avPattern.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.hostname === "b23.tv" && /^\/[0-9A-Za-z]+\/?$/.test(url.pathname)) {
      return { watchUrl: url.href, embedUrl: null };
    }
    if (
      !["www.bilibili.com", "bilibili.com", "m.bilibili.com"].includes(
        url.hostname
      )
    )
      return null;
    const match = url.pathname.match(
      /^\/(?:s\/)?video\/(BV[0-9A-Za-z]{10}|av[1-9]\d*)\/?$/i
    );
    if (!match) return null;
    identifier = match[1];
    const rawPart = url.searchParams.get("p");
    if (rawPart !== null) {
      if (!/^[1-9]\d*$/.test(rawPart)) return null;
      part = Number(rawPart);
      if (!Number.isSafeInteger(part)) return null;
    }
  }
  const player = new URL("https://player.bilibili.com/player.html");
  const aid = identifier.match(avPattern)?.[1];
  if (aid) player.searchParams.set("aid", aid);
  else if (bvPattern.test(identifier))
    player.searchParams.set("bvid", identifier);
  else return null;
  player.searchParams.set("p", String(part));
  player.searchParams.set("autoplay", "0");
  player.searchParams.set("poster", "1");
  const watch = new URL(`https://www.bilibili.com/video/${identifier}/`);
  if (part > 1) watch.searchParams.set("p", String(part));
  return { watchUrl: watch.href, embedUrl: player.href };
}
