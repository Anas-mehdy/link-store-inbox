"use client";

import { useEffect, useState } from "react";
import { loadInbox } from "./inbox-store";

export default function TikTokSettings({ team, onImported }) {
  const [video, setVideo] = useState("");
  const [cursor, setCursor] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState("checking");
  const client = team.client;

  useEffect(() => {
    let disposed = false;
    webhookSettings(client).then(
      data => { if (!disposed) setAutomatic(data.status); },
      () => { if (!disposed) setAutomatic("unavailable"); },
    );
    return () => { disposed = true; };
  }, [client]);

  async function activate() {
    setBusy(true);
    setError("");
    try {
      const data = await webhookSettings(client, "POST");
      setAutomatic(data.status);
    } catch (problem) {
      setError(problem.message || "تعذّر تفعيل المزامنة.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("tiktok");
    if (outcome === "connected") setStatus("تم تفويض الحساب لقراءة التعليقات ونشر الردود.");
    if (outcome === "read-only") setError("تيك توك منحنا صلاحية القراءة فقط. نشر الردود لسه غير مفعّل.");
    if (outcome === "error") setError("تفويض تيك توك ما اكتمل. افتح صفحة الربط وجرّب من جديد.");
    if (outcome === "wrong-account") setError("الحساب اللي فوّضته مختلف عن الحساب المرتبط.");
    if (outcome) {
      url.searchParams.delete("tiktok");
      history.replaceState(null, "", url);
    }
  }, []);

  async function run(path, input) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { data: { session } } = await team.client.auth.getSession();
      if (!session) throw new Error("سجّل الدخول أولًا.");
      const response = await fetch(`/api/tiktok/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (path === "connect") {
        window.location.assign(data.url);
        return;
      }
      const fresh = await loadInbox(team.client, team.member.user_id);
      if (!fresh.member) throw new Error("ما قدرنا نحدّث صندوق الوارد. حدّث الصفحة.");
      onImported(fresh.items);
      setCursor(data.nextCursor);
      setStatus(data.count
        ? `تمت مزامنة ${data.count} تعليق بهالصفحة، والتعليقات الموجودة محفوظة بلا تكرار.`
        : "ما في تعليقات عامة من العملاء بهالصفحة.");
    } catch (problem) {
      setError(problem.message || "تعذّر تنفيذ الطلب.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="placeholderCard tiktok-controls">
      <h2>تعليقات ‎@link.60</h2>
      <div className="webhook-status">
        <strong>المزامنة التلقائية</strong>
        <p role="status">{{
          checking: "جارٍ التحقق من اشتراك تيك توك…",
          active: "مفعّلة لكل الفيديوهات العامة. التعليقات الجديدة تظهر في صندوق الوارد.",
          inactive: "جاهزة للتفعيل لكل الفيديوهات العامة.",
          conflict: "في اشتراك تعليقات بإعداد مختلف على تطبيق تيك توك.",
          unavailable: "تعذّر التحقق من اشتراك تيك توك.",
        }[automatic]}</p>
        {["inactive", "unavailable"].includes(automatic) &&
          <button className="signout" disabled={busy} onClick={activate}>تفعيل المزامنة</button>}
      </div>
      <div className="tiktok-settings-actions">
        <button className="signout" disabled={busy} onClick={() => run("connect", {})}>ربط حساب تيك توك</button>
        <details>
          <summary>استيراد تعليقات سابقة من رابط</summary>
          <form onSubmit={event => { event.preventDefault(); run("comments", { video, cursor }); }}>
            <label>رابط الفيديو
              <input type="url" dir="ltr" required value={video} disabled={busy}
                placeholder="https://www.tiktok.com/@link.60/video/…"
                onChange={event => { setVideo(event.target.value); setCursor(null); setStatus(""); }} />
            </label>
            <button className="signout" disabled={busy}>{cursor ? "استيراد الصفحة التالية" : "استيراد التعليقات"}</button>
          </form>
        </details>
      </div>
      {error && <p className="inbox-error" role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
    </div>
  );
}


async function webhookSettings(client, method = "GET") {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error("سجّل الدخول أولًا.");
  const response = await fetch("/api/tiktok/webhook/setup", {
    method,
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
