import { ReaderApp } from "@/components/reader/reader-app";
import { ensureDefaultUser } from "@/lib/db/user";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDefaultUser();
  return <ReaderApp />;
}
