import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function ipv4FromMappedIpv6(normalized: string): string | null {
  const lower = normalized.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const tail = lower.slice("::ffff:".length);
    if (isIP(tail) === 4) return tail;
  }
  const embedded = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return embedded?.[1] ?? null;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const mappedV4 = ipv4FromMappedIpv6(normalized);
  if (mappedV4) return isPrivateIpv4(mappedV4);
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

export function normalizeHttpUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new UrlValidationError("URL is required");
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new UrlValidationError("Invalid URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new UrlValidationError("Only HTTP and HTTPS URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UrlValidationError("URLs with credentials are not allowed");
  }
  url.hash = "";
  return url;
}

export async function assertSafeFetchUrl(raw: string): Promise<URL> {
  const url = normalizeHttpUrl(raw);
  const hostnameRaw = url.hostname.toLowerCase();
  const hostname = stripIpv6Brackets(hostnameRaw);
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UrlValidationError("Hostname is not allowed");
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new UrlValidationError("Hostname is not allowed");
  }

  const allowlist = process.env.FEED_ALLOWLIST?.split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist && allowlist.length > 0 && !allowlist.includes(hostname)) {
    throw new UrlValidationError("Hostname is not in the allowlist");
  }

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new UrlValidationError("Private or local IP addresses are not allowed");
    }
    return url;
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlValidationError("Could not resolve hostname");
  }
  for (const addr of addresses) {
    if (isBlockedIp(addr.address)) {
      throw new UrlValidationError("Hostname resolves to a private or local address");
    }
  }
  return url;
}
