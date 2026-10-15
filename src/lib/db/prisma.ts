import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import type { D1Database } from "@cloudflare/workers-types";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const logLevels: ("error" | "warn")[] =
  process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];

/** Cloudflare request context set by OpenNext (see @opennextjs/cloudflare getCloudflareContext). */
const CF_CONTEXT = Symbol.for("__cloudflare-context__");

const d1Clients = new WeakMap<object, PrismaClient>();

function getD1Binding(): D1Database | undefined {
  const ctx = (globalThis as Record<symbol, unknown>)[CF_CONTEXT] as
    | { env?: { DB?: D1Database } }
    | undefined;
  return ctx?.env?.DB;
}

function getNodeClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ log: logLevels });
  }
  return globalForPrisma.prisma;
}

/**
 * Returns the Prisma client for the current runtime: a D1-backed client when running
 * on Cloudflare Workers (DB binding present), otherwise the regular SQLite client.
 */
export function getPrisma(): PrismaClient {
  const db = getD1Binding();
  if (!db) return getNodeClient();
  let client = d1Clients.get(db);
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaD1(db), log: logLevels });
    d1Clients.set(db, client);
  }
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
