import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

type IpClassification = "public" | "private" | "unknown";

export type SafeFetchEndpoint = {
  url: URL;
  hostname: string;
  pinnedAddresses: string[];
};

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function stripZoneId(ip: string): string {
  const zone = ip.indexOf("%");
  return zone === -1 ? ip : ip.slice(0, zone);
}

function hexIpv4MappedTailToDotted(tail: string): string | null {
  const parts = tail.split(":");
  if (parts.length !== 2) return null;
  const hi = Number.parseInt(parts[0], 16);
  const lo = Number.parseInt(parts[1], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo) || hi > 0xffff || lo > 0xffff) return null;
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function ipv4FromMappedIpv6Prefix(normalized: string): string | null {
  const lower = normalized.toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;
  const tail = lower.slice("::ffff:".length);
  if (isIP(tail) === 4) return tail;
  const dotted = tail.match(/^(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  return hexIpv4MappedTailToDotted(tail);
}

function ipv4FromEmbeddedMappedIpv6(normalized: string): string | null {
  const lower = normalized.toLowerCase();
  const dottedMatch = lower.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedMatch) return dottedMatch[1];
  const hexMatch = lower.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) return hexIpv4MappedTailToDotted(`${hexMatch[1]}:${hexMatch[2]}`);
  return null;
}

function ipv4FromMappedIpv6(normalized: string): string | null {
  return ipv4FromMappedIpv6Prefix(normalized) ?? ipv4FromEmbeddedMappedIpv6(normalized);
}

function firstIpv6Hextet(normalized: string): string | null {
  const lower = normalized.toLowerCase();
  if (!lower.includes(":")) return null;
  if (lower.startsWith("::")) {
    const rest = lower.slice(2);
    if (!rest) return null;
    return rest.split(":")[0] || null;
  }
  return lower.split(":")[0] || null;
}

function isUniqueLocalIpv6(normalized: string): boolean {
  const first = firstIpv6Hextet(normalized);
  if (!first) return false;
  const value = Number.parseInt(first, 16);
  if (Number.isNaN(value)) return false;
  return (value & 0xfe00) === 0xfc00;
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
  if (isUniqueLocalIpv6(normalized)) return true;
  const mappedV4 = ipv4FromMappedIpv6(normalized);
  if (mappedV4) return isPrivateIpv4(mappedV4);
  return false;
}

function classifyResolvedIp(raw: string): IpClassification {
  const ip = stripZoneId(raw.trim());
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip) ? "private" : "public";
  if (version === 6) return isPrivateIpv6(ip) ? "private" : "public";
  return "unknown";
}

function isBlockedIp(ip: string): boolean {
  return classifyResolvedIp(ip) !== "public";
}

export function pickPublicAddresses(
  addresses: { address: string; family: number }[],
  options?: { rejectMixed?: boolean },
): string[] {
  const publicAddresses: string[] = [];
  let hasPrivate = false;

  for (const entry of addresses) {
    const classification = classifyResolvedIp(entry.address);
    if (classification === "public") {
      publicAddresses.push(stripZoneId(entry.address.trim()));
    } else if (classification === "private") {
      hasPrivate = true;
    }
  }

  if (options?.rejectMixed && hasPrivate && publicAddresses.length > 0) {
    throw new UrlValidationError("Hostname has mixed public and private DNS responses");
  }

  if (publicAddresses.length === 0) {
    if (hasPrivate) {
      throw new UrlValidationError("Hostname resolves to a private or local address");
    }
    throw new UrlValidationError("Could not verify hostname address");
  }

  return [...new Set(publicAddresses)];
}

function validateHostnameAllowed(hostname: string): void {
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

export async function resolveSafeFetchEndpoint(
  raw: string,
  options?: { rejectMixed?: boolean },
): Promise<SafeFetchEndpoint> {
  const url = normalizeHttpUrl(raw);
  const hostname = stripIpv6Brackets(url.hostname.toLowerCase());
  validateHostnameAllowed(hostname);

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new UrlValidationError("Private or local IP addresses are not allowed");
    }
    return { url, hostname, pinnedAddresses: [hostname] };
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlValidationError("Could not resolve hostname");
  }

  const pinnedAddresses = pickPublicAddresses(addresses, options);
  return { url, hostname, pinnedAddresses };
}

export async function assertSafeFetchUrl(raw: string): Promise<URL> {
  const { url } = await resolveSafeFetchEndpoint(raw, { rejectMixed: false });
  return url;
}
