import { useEffect, useState } from "react";
import { inboxItem, inboxPageSize, loadConversations, loadTikTokVideos, mergeConversations } from "./inbox-store";

export function useInboxLive(team, setItems, video, setVideoFeed) {
  const [videos, setVideos] = useState([]);
  const [connection, setConnection] = useState("connecting");
  const [generation, setGeneration] = useState(0);
  const [catalogError, setCatalogError] = useState(false);
  const client = team?.client;
  const members = team?.members;

  useEffect(() => {
    if (!client) return;
    let disposed = false;
    let catalogTimer;
    let catalogRequest = 0;

    function refreshCatalog() {
      const request = ++catalogRequest;
      loadTikTokVideos(client).then(
        results => {
          if (!disposed && request === catalogRequest) {
            setVideos(results);
            setCatalogError(false);
          }
        },
        () => { if (!disposed && request === catalogRequest) setCatalogError(true); },
      );
    }

    refreshCatalog();
    const channel = client.channel("link-inbox-new-comments").on("postgres_changes", {
      event: "INSERT", schema: "public", table: "link_inbox_conversations",
    }, ({ new: row }) => {
      if (disposed || !row.tiktok_video_id) return;
      const item = inboxItem(row, members);
      setItems(previous => mergeConversations(previous, [item]).slice(0, inboxPageSize));
      setVideoFeed(previous => previous?.id === row.tiktok_video_id
        ? { ...previous, items: mergeConversations(previous.items, [item]) } : previous);
      clearTimeout(catalogTimer);
      catalogTimer = setTimeout(refreshCatalog, 200);
    }).subscribe(status => {
      if (disposed) return;
      if (status !== "SUBSCRIBED") {
        setConnection("offline");
        return;
      }
      setConnection("live");
      // Reconcile any inserts that arrived while the browser was disconnected.
      setGeneration(value => value + 1);
      refreshCatalog();
      loadConversations(client, members).then(results => {
        if (!disposed) setItems(previous => mergeConversations(previous, results).slice(0, inboxPageSize));
      }).catch(() => {});
    });
    return () => {
      disposed = true;
      clearTimeout(catalogTimer);
      void client.removeChannel(channel);
    };
  }, [client, members, setItems, setVideoFeed]);

  useEffect(() => {
    if (!client || !video) return;
    let disposed = false;
    loadConversations(client, members, { video }).then(
      results => {
        if (disposed) return;
        setVideoFeed(previous => ({
          id: video,
          items: mergeConversations(previous?.id === video ? previous.items : [], results),
          hasMore: previous?.id === video && previous.ready ? previous.hasMore : results.length === inboxPageSize,
          ready: true,
        }));
      },
      () => {
        if (!disposed) setVideoFeed(previous => previous?.id === video ? { ...previous, error: true } : previous);
      },
    );
    return () => { disposed = true; };
  }, [client, members, video, generation, setVideoFeed]);

  return { videos, connection, catalogError, reloadVideo: () => setGeneration(value => value + 1) };
}
