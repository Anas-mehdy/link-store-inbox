"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import Inbox from "./inbox";
import { loadInbox } from "./inbox-store";

export default function InboxAccess({ config }) {
  if (!config) return <Inbox />;
  if (!config.url || !config.key) return <AccessCard title="إعداد اتصال صندوق الوارد غير مكتمل" />;
  return <TeamAccess config={config} />;
}

function TeamAccess({ config }) {
  const clientRef = useRef(null);
  const [client, setClient] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    clientRef.current ??= createClient(config.url, config.key, {
      auth: { storageKey: "link-store-inbox-auth", detectSessionInUrl: false },
    });
    const supabase = clientRef.current;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setClient(supabase);
    });
    return () => subscription.unsubscribe();
  }, [config.url, config.key]);

  if (!client) return <AccessCard title="جارٍ التحقق من الجلسة…" />;
  if (!userId) return <SignIn client={client} />;
  return <TeamInbox key={userId} client={client} userId={userId} />;
}

function SignIn({ client }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await client.auth.signInWithPassword({
        email: form.get("email").trim(),
        password: form.get("password"),
      });
      if (result.error) setError("تعذّر تسجيل الدخول. تحقّق من البريد وكلمة المرور.");
    } catch {
      setError("تعذّر الاتصال بخدمة تسجيل الدخول.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AccessCard title="تسجيل دخول الفريق">
      <form onSubmit={signIn}>
        <label>البريد الإلكتروني<input name="email" type="email" autoComplete="username" dir="ltr" required /></label>
        <label>كلمة المرور<input name="password" type="password" autoComplete="current-password" dir="ltr" required /></label>
        {error && <p role="alert">{error}</p>}
        <button disabled={pending}>{pending ? "جارٍ الدخول…" : "تسجيل الدخول"}</button>
      </form>
    </AccessCard>
  );
}

function TeamInbox({ client, userId }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadInbox(client, userId).then(
      data => { if (!cancelled) setResult(data); },
      () => { if (!cancelled) setResult({ error: true }); },
    );
    return () => { cancelled = true; };
  }, [client, userId, attempt]);

  async function signOut() {
    setSignOutError("");
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch {
      setSignOutError("تعذّر تسجيل الخروج. جرّب مرة ثانية.");
    }
  }

  if (!result) return <AccessCard title="جارٍ تحميل صندوق الوارد…" />;
  if (result.error || !result.member) {
    return (
      <AccessCard title={result.error ? "تعذّر تحميل صندوق الوارد" : "حسابك غير مفعّل ضمن فريق صندوق الوارد"}>
        {result.error && <button onClick={() => { setResult(null); setAttempt(attempt + 1); }}>إعادة المحاولة</button>}
        <button onClick={signOut}>تسجيل الخروج</button>
        {signOutError && <p role="alert">{signOutError}</p>}
      </AccessCard>
    );
  }

  return <Inbox team={{ ...result, client, signOut, signOutError }} />;
}

function AccessCard({ title, children }) {
  return <main className="access-screen"><section className="access-card">
    <span>Link Store · Customer Inbox</span>
    <h1>{title}</h1>
    {children}
  </section></main>;
}
