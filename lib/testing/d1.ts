import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/**
 * Minimal D1Database over node:sqlite for integration tests. It runs the real SQL from
 * /migrations, and `batch()` is a transaction like D1's.
 */

type Value = string | number | null | bigint | Uint8Array;

function toValue(value: unknown): Value {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  return value as Value;
}

class Statement {
  constructor(
    private readonly database: DatabaseSync,
    readonly sql: string,
    private readonly params: Value[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new Statement(this.database, this.sql, values.map(toValue));
  }

  private returnsRows() {
    return /^\s*(select|with|pragma)/i.test(this.sql) || /\breturning\b/i.test(this.sql);
  }

  async all<T>() {
    return this.allSync<T>();
  }

  allSync<T>() {
    const statement = this.database.prepare(this.sql);
    if (this.returnsRows()) {
      const results = statement.all(...this.params) as T[];
      return { results, success: true, meta: { changes: 0 } };
    }
    const info = statement.run(...this.params);
    return { results: [] as T[], success: true, meta: { changes: Number(info.changes) } };
  }

  async first<T>(column?: string) {
    const row = this.database.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async run() {
    return this.allSync();
  }

  async raw() {
    return this.database.prepare(this.sql).all(...this.params).map((row) => Object.values(row as object));
  }
}

export function createTestD1(migrations = ["0001_phase1.sql", "0003_phase2.sql"]) {
  const database = new DatabaseSync(":memory:");
  for (const file of migrations) {
    database.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), "utf8"));
  }
  const d1 = {
    prepare: (sql: string) => new Statement(database, sql),
    async batch(statements: Statement[]) {
      database.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.allSync());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql: string) {
      database.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return { d1: d1 as unknown as D1Database, sqlite: database };
}
