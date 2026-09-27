/**
 * Grants or removes a moderation role. Prints SQL for `wrangler d1 execute`:
 *
 *   pnpm exec tsx scripts/grant-role.ts --email person@example.com --role moderator \
 *     | pnpm exec wrangler d1 execute DB --remote --file=/dev/stdin
 *
 * Roles: user | moderator | admin. The person must have signed in once so their account exists.
 */
import { roleGrantSql } from "../lib/roles";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = arg("email");
const role = arg("role");
if (!email || !role) {
  console.error("Usage: tsx scripts/grant-role.ts --email <email> --role <user|moderator|admin>");
  process.exit(1);
}
process.stdout.write(roleGrantSql(email, role, Date.now()));
