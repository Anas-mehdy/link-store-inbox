import { useCallback, useEffect, useRef, useState } from "react";
import { loadConversations, loadTikTokVideos } from "./inbox-store";

export function useInboxLive(team, { term, video, type, status }) {
  const client = team?.client;
  const members = team?.members;
  const [connection, setConnection] = useState("connecting");
  const [counts, setCounts] = useState(null);
  const [videos, setVideos] = useState([]);
  const [summaryError, setSummaryError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  const [feed, setFeed] = useState(null);
  const cache = useRef(null);
  const [pageRequest, setPageRequest] = useState(null);
  const key = JSON.stringify([term, video, type, status]);
  const pages = pageRequest?.key === key ? pageRequest.pages : 1;

  useEffect(() => {
    if (!client) return;
    let timer;
    function scheduleRefresh() {
      if (timer) return;
      timer = setTimeout(() => { timer = null; refresh(); }, 250);
    }
    const channel = client.channel("link-inbox-conversations").on("postgres_changes", {
      event: "*", schema: "public", table: "link_inbox_conversations",
    }, scheduleRefresh).on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "link_inbox_drafts",
      filter: "tiktok_delivery=eq.published",
    }, scheduleRefresh).subscribe(state => {
      setConnection(state === "SUBSCRIBED" ? "live" : "offline");
      if (state === "SUBSCRIBED") scheduleRefresh();
    });
    return () => {
      clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [client, refresh]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    Promise.allSettled([
      client.rpc("link_inbox_counts").throwOnError(),
      loadTikTokVideos(client),
    ]).then(([totals, catalog]) => {
      if (cancelled) return;
      if (totals.status === "fulfilled") setCounts(totals.value.data);
      if (catalog.status === "fulfilled") setVideos(catalog.value);
      setSummaryError(totals.status === "rejected" || catalog.status === "rejected");
    });
    return () => { cancelled = true; };
  }, [client, revision]);

  useEffect(() => {
    if (!client) return;
    const controller = new AbortController();
    async function readPages() {
      const last = cache.current;
      const append = last?.key === key && last.revision === revision && last.pages + 1 === pages;
      const items = append ? [...last.items] : [];
      let count = append ? last.count : 0;
      try {
        for (let i = append ? last.pages : 0; i < pages; i++) {
          const page = await loadConversations(client, members, {
            term, video, type, status, before: items.at(-1), signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          if (i === 0) count = page.count;
          items.push(...page.items);
          if (!page.items.length || page.items.length >= page.count) break;
        }
        const result = { key, pages, revision, items, count };
        cache.current = result;
        setFeed(result);
      } catch {
        if (!controller.signal.aborted) {
          setFeed({ ...(last?.key === key ? last : { key, items: [] }), error: true });
        }
      }
    }
    const timer = setTimeout(readPages, term ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, members, key, pages, revision, term, video, type, status]);

  const visible = feed?.key === key ? feed : null;
  return {
    counts, videos, connection, summaryError, refresh,
    updateItem(id, apply) {
      setFeed(previous => previous && {
        ...previous, items: previous.items.map(item => item.id === id ? apply(item) : item),
      });
      refresh();
    },
    items: visible?.items ?? [], count: visible?.count,
    loading: !visible, error: visible?.error,
    hasMore: visible && visible.items.length < visible.count,
    loadingMore: visible && !visible.error && visible.pages < pages,
    loadMore: () => setPageRequest({ key, pages: pages + 1 }),
  };
}
