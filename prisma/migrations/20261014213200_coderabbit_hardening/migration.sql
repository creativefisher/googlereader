-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feedId" TEXT NOT NULL,
    "guid" TEXT,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "summary" TEXT,
    "contentHtml" TEXT,
    "publishedAt" DATETIME,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Article_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "Feed" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Article" ("id", "feedId", "guid", "url", "title", "author", "summary", "contentHtml", "publishedAt", "fingerprint", "createdAt") SELECT "id", "feedId", "guid", "url", "title", "author", "summary", "contentHtml", "publishedAt", "fingerprint", "createdAt" FROM "Article";
DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";
CREATE INDEX "Article_feedId_publishedAt_idx" ON "Article"("feedId", "publishedAt");
CREATE INDEX "Article_feedId_guid_idx" ON "Article"("feedId", "guid");
CREATE UNIQUE INDEX "Article_feedId_fingerprint_key" ON "Article"("feedId", "fingerprint");
CREATE TABLE "new_Feed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "siteUrl" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "etag" TEXT,
    "lastModified" TEXT,
    "lastFetchedAt" DATETIME,
    "lastError" TEXT,
    "refreshInProgress" BOOLEAN NOT NULL DEFAULT false,
    "refreshStartedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Feed" ("id", "url", "siteUrl", "title", "description", "etag", "lastModified", "lastFetchedAt", "lastError", "refreshInProgress", "createdAt", "updatedAt") SELECT "id", "url", "siteUrl", "title", "description", "etag", "lastModified", "lastFetchedAt", "lastError", "refreshInProgress", "createdAt", "updatedAt" FROM "Feed";
DROP TABLE "Feed";
ALTER TABLE "new_Feed" RENAME TO "Feed";
CREATE UNIQUE INDEX "Feed_url_key" ON "Feed"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
