const LEGACY_PODCAST_STORAGE_KEYS = [
  "podcast_api_key",
  "saved_podcasts",
  "currentPodcastSession",
  "lingovibe_podcast_library",
  // 曾用于 Bing；已改为服务端 TAVILY_API_KEY
  "reading_search_api_key",
] as const;

/** Removes pre-migration podcast-related localStorage entries. Does not touch lingovibe_daily_loop or lingovibe_learning_analytics. */
export function clearLegacyPodcastStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_PODCAST_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore access/quota errors
  }
}
