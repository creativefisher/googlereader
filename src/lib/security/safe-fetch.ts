import { assertSafeFetchUrl } from "@/lib/security/url";

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

/**
 * Fetch with manual redirects; each hop is validated for SSRF.
 */
export async function fetchWithSafeRedirects(
  rawUrl: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<SafeFetchResult> {
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = (await assertSafeFetchUrl(rawUrl)).toString();
  let redirectCount = 0;

  while (true) {
    const response = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
    });

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SafeFetchError(`Redirect ${response.status} without Location header`);
      }
      if (redirectCount >= maxRedirects) {
        throw new SafeFetchError("Too many redirects");
      }
      currentUrl = (await assertSafeFetchUrl(new URL(location, currentUrl).toString())).toString();
      redirectCount += 1;
      continue;
    }

    return { response, finalUrl: currentUrl };
  }
}
