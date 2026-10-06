import { describe, expect, it } from "vitest";
import { parseJsonc, readWranglerConfig } from "./wrangler-config";

// Previews must never be able to read or write production data, send real mail, enqueue onto production
// queues or spend production's rate-limit budgets. These checks fail CI if wrangler.jsonc drifts.
const config = readWranglerConfig();
const previews = config.previews ?? {};

describe("wrangler.jsonc previews block", () => {
  it("names the environment", () => {
    expect(config.vars?.ENVIRONMENT).toBe("production");
    expect(previews.vars?.ENVIRONMENT).toBe("preview");
    expect(previews.vars?.EMAIL_SINK).toBe("1");
  });

  it("binds its own D1 databases", () => {
    expect(config.d1_databases?.length).toBeGreaterThan(0);
    for (const database of config.d1_databases ?? []) {
      const preview = previews.d1_databases?.find((entry) => entry.binding === database.binding);
      expect(preview, `previews.d1_databases is missing ${database.binding}`).toBeDefined();
      expect(preview?.database_id).not.toBe(database.database_id);
      expect(preview?.database_name).not.toBe(database.database_name);
    }
  });

  it("binds its own R2 buckets and KV namespaces", () => {
    for (const bucket of config.r2_buckets ?? []) {
      const preview = previews.r2_buckets?.find((entry) => entry.binding === bucket.binding);
      expect(preview, `previews.r2_buckets is missing ${bucket.binding}`).toBeDefined();
      expect(preview?.bucket_name).not.toBe(bucket.bucket_name);
    }
    for (const namespace of config.kv_namespaces ?? []) {
      const preview = previews.kv_namespaces?.find((entry) => entry.binding === namespace.binding);
      expect(preview, `previews.kv_namespaces is missing ${namespace.binding}`).toBeDefined();
      expect(preview?.id).not.toBe(namespace.id);
    }
  });

  it("counts rate limits in its own namespaces", () => {
    const production = new Set((config.ratelimits ?? []).map((entry) => entry.namespace_id));
    for (const limit of config.ratelimits ?? []) {
      const preview = previews.ratelimits?.find((entry) => entry.name === limit.name);
      expect(preview, `previews.ratelimits is missing ${limit.name}`).toBeDefined();
      expect(production.has(preview!.namespace_id), `${limit.name} shares a namespace with production`).toBe(false);
    }
  });

  it("cannot send mail, enqueue jobs, take routes or run crons", () => {
    expect(previews.send_email).toBeUndefined();
    expect(previews.queues).toBeUndefined();
    expect(previews.routes).toBeUndefined();
    expect(previews.triggers).toBeUndefined();
  });
});

describe("parseJsonc", () => {
  it("keeps // inside strings and drops comments and trailing commas", () => {
    expect(parseJsonc('{\n  // note\n  "url": "https://a.b/c", /* x */ "list": [1, 2,],\n}')).toEqual({ url: "https://a.b/c", list: [1, 2] });
  });
});
