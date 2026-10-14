/** Single-user mode: reserved for future multi-user support. */
export const DEFAULT_USER_ID = "default-user";

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 30;

export const FEED_FETCH_TIMEOUT_MS = 15_000;

export const ARTICLES_PAGE_SIZE = 30;

/** Locks older than this are treated as stale (e.g. crashed refresh). */
export const REFRESH_STALE_LOCK_MS = 15 * 60 * 1000;

export const OPML_MAX_FEED_IMPORTS = 200;

export const OPML_IMPORT_CONCURRENCY = 3;
