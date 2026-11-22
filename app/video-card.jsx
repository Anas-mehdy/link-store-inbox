"use client";
import { useEffect, useState } from "react";

const previewAge = 60 * 60_000;
export function videoLink(id) {
  return `https://www.tiktok.com/@link.60/video/${id}`;
}
export function videoLabel(card, id) {
  const text = card?.internal_title || card?.caption?.split(/\s+#/)[0]?.trim() || card?.caption;
  return text ? (text.length > 65 ? text.slice(0, 64) + "…" : text) : `فيديو ⁦${id.slice(-7)}⁩`;
}

export default function VideoCard({ id, card, client, time, onSaved, onShowComments, disabled }) {
  const [preview, setPreview] = useState(null);
  const [failedCover, setFailedCover] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const metadata = Date.parse(preview?.fetched_at) > (Date.parse(card?.fetched_at) || 0) ? preview : card;
  const caption = metadata?.caption || "";
  const cover = metadata?.cover_url || "";
  const fetchedAt = metadata?.fetched_at;
  const broken = Boolean(cover && failedCover === cover);

  useEffect(() => {
    if (!client) return;
    const age = Date.now() - Date.parse(fetchedAt);
    if (age < (broken ? 5 * 60_000 : previewAge)) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    async function readPreview() {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (!session) return;
        const response = await fetch("/api/tiktok/video-card", {
          method: "POST", signal: controller.signal,
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: id }),
        });
        if (!response.ok) return;
        const value = await response.json();
        if (!controller.signal.aborted) {
          setPreview(value);
          onSaved(id, value);
        }
      } catch {
        // A saved caption or team title stays usable when TikTok is unavailable.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    readPreview();
    return () => { controller.abort(); };
  }, [id, client, fetchedAt, broken, attempt, onSaved]);

  async function saveTitle(event) {
    event.preventDefault();
    setBusy(true);
    setSaveError(false);
    const value = title.trim() || null;
    try {
      await client.from("link_inbox_video_cards").upsert({ video_id: id, internal_title: value },
        { onConflict: "video_id", defaultToNull: false }).throwOnError();
      onSaved(id, { internal_title: value });
      setEditing(false);
    } catch {
      setSaveError(true);
    } finally {
      setBusy(false);
    }
  }
  return <section className="video-card" aria-label="بطاقة الفيديو">
    <div className="video-card-top">
      {cover && !broken
        ? <img src={cover} alt="غلاف الفيديو" referrerPolicy="no-referrer" onError={() => setFailedCover(cover)} />
         : (!loading || broken) ? <iframe className="video-embed-preview" title="معاينة الفيديو داخل الداشبورد"
            src={`https://www.tiktok.com/player/v1/${id}?autoplay=0&muted=1&description=1&music_info=0&rel=0`}
            loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
          : <div className="video-cover-empty" aria-hidden="true">▶</div>}
      <div className="video-card-copy">
        <small>الفيديو المرتبط بالتعليق</small>
        <strong>{card?.internal_title || (!caption ? videoLabel(null, id) : "وصف الفيديو")}</strong>
        {caption ? <p className={expanded ? "" : "caption-short"} dir="auto">{caption}</p>
          : <p>{loading ? "جارٍ تحميل وصف الفيديو…" : "وصف تيك توك غير متاح."}</p>}
        {caption.length > 85 && <button type="button" className="card-text-action"
          aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? "اختصار الوصف" : "الوصف كاملًا"}</button>}
        {!loading && !caption && (!cover || broken) && <button type="button" className="card-text-action"
          onClick={() => setAttempt(n => n + 1)}>تحديث المعاينة</button>}
      </div>
    </div>
    {editing ? <form className="video-title-form" onSubmit={saveTitle}>
      <label>اسم الفيديو داخل الفريق<input autoFocus value={title} maxLength={100}
        onChange={e => setTitle(e.target.value)} placeholder="مثال: حماية زد فولد 8" /></label>
      <button disabled={busy}>حفظ</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>إلغاء</button>
      {saveError && <small role="alert">تعذّر حفظ الاسم. جرّب مرة ثانية.</small>}
    </form> : <div className="video-card-actions">
      <button type="button" disabled={disabled} onClick={onShowComments}>كل تعليقات الفيديو{card && ` (${card.comment_count})`}</button>
      <a href={videoLink(id)} target="_blank" rel="noreferrer">فتح الفيديو</a>
      <button type="button" onClick={() => { setTitle(card?.internal_title || ""); setSaveError(false); setEditing(true); }}>
        {card?.internal_title ? "تعديل الاسم" : "تسمية الفيديو"}
      </button>
    </div>}
    <small className="video-comment-time">وقت التعليق · {time}</small>
  </section>;
}
