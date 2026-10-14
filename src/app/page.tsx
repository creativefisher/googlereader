import { ReaderApp } from "@/components/reader/reader-app";
import { ensureDefaultUser } from "@/lib/db/user";

export default async function HomePage() {
  await ensureDefaultUser();
  return <ReaderApp />;
}
