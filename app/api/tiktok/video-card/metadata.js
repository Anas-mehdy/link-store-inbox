export function publicVideoMetadata(html, id, account) {
  const script = html.match(/<script\b[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!script) return null;
  const data = JSON.parse(script[1]);
  const item = data?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  if (item?.id !== id || item.author?.uniqueId?.toLowerCase() !== account) return null;
  const caption = typeof item.desc === "string" ? item.desc.trim().slice(0, 4000) : "";
  const url = URL.parse(item.video?.cover ?? item.imagePost?.cover?.imageURL?.urlList?.[0] ?? "");
  const cover = url?.protocol === "https:" && !url.username && !url.password ? url.href : "";
  return caption || cover ? { caption, cover } : null;
}
