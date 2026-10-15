import {
  Agent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
} from "undici";
import { isIP, type LookupFunction } from "node:net";

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

type UndiciFetchResponse = Awaited<ReturnType<typeof undiciFetch>>;

export interface SafeFetchResult {
  response: UndiciFetchResponse;
  finalUrl: string;
}

function createPinnedLookup(pinnedAddress: string): LookupFunction {
  const family = isIP(pinnedAddress) === 6 ? 6 : 4;
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, [{ address: pinnedAddress, family }]);
      return;
    }
    callback(null, pinnedAddress, family);
  };
}

function createPinnedDispatcher(pinnedAddress: string, tlsServername: string, useTls: boolean): Dispatcher {
  return new Agent({
    connect: {
      ...(useTls ? { servername: tlsServername } : {}),
      lookup: createPinnedLookup(pinnedAddress),
    },
  });
}

async function fetchPinnedAddress(
  url: URL,
  hostname: string,
  pinnedAddress: string,
  init: UndiciRequestInit,
): Promise<UndiciFetchResponse> {
  const dispatcher = createPinnedDispatcher(pinnedAddress, hostname, url.protocol === "https:");
  const response = await undiciFetch(url, {
    ...init,
    dispatcher,
    redirect: "manual",
  });
  void dispatcher.close();
  return response;
}

async function fetchWithPinnedAddresses(
  endpoint: { url: URL; hostname: string; pinnedAddresses: string[] },
  init: UndiciRequestInit,
): Promise<UndiciFetchResponse> {
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
  init: UndiciRequestInit & { maxRedirects?: number } = {},
): Promise<SafeFetchResult> {
  const { maxRedirects = DEFAULT_MAX_REDIRECTS, ...requestInit } = init;
  let endpoint = await resolveSafeFetchEndpoint(rawUrl, { rejectMixed: false });
  let currentUrl = endpoint.url.toString();
  let redirectCount = 0;

  while (true) {
    const response = await fetchWithPinnedAddresses(endpoint, requestInit);

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
