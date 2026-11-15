// Build on Vercel: map the Postgres integration's variable names to Prisma's, apply migrations, then build.
import { execSync } from "node:child_process";

const env = process.env;
env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL;
env.DIRECT_URL ||= env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;

if (!env.DATABASE_URL) {
  console.error("\n✗ No database is connected. In Vercel: Storage → Create Database → Neon (free), connect it to this project, then redeploy.\n");
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
run("npx prisma migrate deploy");
run("npx next build");
