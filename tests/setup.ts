import { execSync } from "node:child_process";
import path from "node:path";

process.env.DATABASE_URL = `file:${path.join(process.cwd(), "prisma", "test.db")}`;

execSync("npx prisma db push --force-reset --skip-generate", {
  stdio: "ignore",
  env: process.env,
});
