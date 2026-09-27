export const ROLES = ["user", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** SQL for scripts/grant-role.ts: sets the role and records it in the audit log. */
export function roleGrantSql(email: string, role: string, now: number): string {
  if (!(ROLES as readonly string[]).includes(role)) throw new Error(`Unknown role: ${role}`);
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(address)) throw new Error(`Not an email: ${email}`);
  const trust = role === "user" ? "NULL" : "3";
  return [
    `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, before_json, after_json, created_at)`,
    `  SELECT 'cli-' || hex(randomblob(8)), NULL, 'grant_role', 'user', id, json_object('role', role), json_object('role', ${quote(role)}), ${now}`,
    `  FROM user WHERE email = ${quote(address)};`,
    `UPDATE user SET role = ${quote(role)}, trust_override = ${trust}, trust_level = coalesce(${trust}, trust_level), updated_at = ${now} WHERE email = ${quote(address)};`,
    "",
  ].join("\n");
}
