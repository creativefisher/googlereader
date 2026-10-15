import { Agent, type Dispatcher } from "undici";
import { isIP } from "node:net";

import { resolveSafeFetchEndpoint } from "@/lib/security/url";

const DEFAULT_MAX_REDIRECTS = 5;

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUS.has(status);
}

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
}

function pinnedUrlForAddress(url: URL, pinnedAddress: string): URL {
  const requestUrl = new URL(url.toString());
  const family = isIP(pinnedAddress);
  requestUrl.hostname = family === 6 ? `[${pinnedAddress}]` : pinnedAddress;
  return requestUrl;
}

function createPinnedDispatcher(pinnedAddress: string, tlsServername: string, useTls: boolean): Dispatcher {
  const family = isIP(pinnedAddress) === 6 ? 6 : 4;
  return new Agent({
    connect: {
      ...(useTls ? { servername: tlsServername } : {}),
      lookup(_hostname, _options, callback) {
        callback(null, pinnedAddress, family);
      },
    },
  });
}

async function fetchPinnedAddress(
  url: URL,
  hostname: string,
  pinnedAddress: string,
  init: RequestInit,
): Promise<Response> {
  const requestUrl = pinnedUrlForAddress(url, pinnedAddress);
  const headers = new Headers(init.headers);
  headers.set("Host", hostname);

  const dispatcher = createPinnedDispatcher(pinnedAddress, hostname, url.protocol === "https:");
  try {
    return await fetch(requestUrl, {
      ...init,
      headers,
      dispatcher,
      redirect: "manual",
    } as RequestInit & { dispatcher: Dispatcher });
  } finally {
    await dispatcher.close();
  }
}

async function fetchWithPinnedAddresses(
  endpoint: { url: URL; hostname: string; pinnedAddresses: string[] },
  init: RequestInit,
): Promise<Response> {
  let lastError: unknown;
  for (const pinnedAddress of endpoint.pinnedAddresses) {
    try {
      return await fetchPinnedAddress(endpoint.url, endpoint.hostname, pinnedAddress, init);
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "Fetch failed";
  throw new SafeFetchError(message);
}

/**
 * Fetch with manual redirects; each hop is validated for SSRF and pinned to public DNS results.
 */
export async function fetchWithSafeRedirects(
  rawUrl: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<SafeFetchResult> {
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let endpoint = await resolveSafeFetchEndpoint(rawUrl, { rejectMixed: false });
  let currentUrl = endpoint.url.toString();
  let redirectCount = 0;

  while (true) {
    const response = await fetchWithPinnedAddresses(endpoint, init);

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SafeFetchError(`Redirect ${response.status} without Location header`);
      }
      if (redirectCount >= maxRedirects) {
        throw new SafeFetchError("Too many redirects");
      }
      currentUrl = new URL(location, currentUrl).toString();
      endpoint = await resolveSafeFetchEndpoint(currentUrl, { rejectMixed: false });
      redirectCount += 1;
      continue;
    }

    return { response, finalUrl: currentUrl };
  }
}
