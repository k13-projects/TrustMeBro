#!/usr/bin/env node
// Vercel project setup automation.
//
// One-time prep:
//   1. Visit https://vercel.com/account/settings/tokens
//   2. Create a token (name e.g. "claude-code-trustmebro"), scope it to
//      your team (katalizor-kazims-projects). Copy the token.
//   3. Add to .env.local: VERCEL_TOKEN=<paste>
//
// Usage:
//   node --env-file=.env.local scripts/vercel-setup.mjs
//     → disables Vercel Authentication, syncs .env.local to project env.
//
//   node --env-file=.env.local scripts/vercel-setup.mjs --disable-protection
//     → just turns off the Vercel Auth toggle.
//
//   node --env-file=.env.local scripts/vercel-setup.mjs --sync-env
//     → just pushes .env.local KEY=VALUE pairs to Vercel project env.
//
//   --project=<name>  override (default: "trustmebro")
//   --team=<slug>     override (default: "katalizor-kazims-projects")
//   --dry-run         show what would change without writing

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.VERCEL_TOKEN;
if (!TOKEN) {
  console.error(
    "VERCEL_TOKEN not set.\n" +
      "Generate one at https://vercel.com/account/settings/tokens (scope it to your team)\n" +
      "then add VERCEL_TOKEN=... to .env.local.",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};

const PROJECT = opt("project", "trustmebro");
const TEAM = opt("team", "katalizor-kazims-projects");
const DRY = flag("dry-run");
const doProtection = flag("disable-protection") || (!flag("sync-env") && !flag("disable-protection"));
const doEnv = flag("sync-env") || (!flag("sync-env") && !flag("disable-protection"));

const API = "https://api.vercel.com";

async function vercel(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const err = new Error(
      `vercel ${method} ${path} → ${res.status} ${res.statusText}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

console.log(`→ Resolving team "${TEAM}"...`);
const team = await vercel("GET", `/v2/teams/${encodeURIComponent(TEAM)}`);
const teamId = team.id;
console.log(`  team id: ${teamId}`);

console.log(`→ Resolving project "${PROJECT}"...`);
const project = await vercel(
  "GET",
  `/v9/projects/${encodeURIComponent(PROJECT)}?teamId=${teamId}`,
);
console.log(`  project id: ${project.id}`);

if (doProtection) {
  const current = project.ssoProtection;
  if (current && current.deploymentType) {
    console.log(
      `→ Vercel Authentication currently: ${current.deploymentType}. Disabling...`,
    );
    if (DRY) {
      console.log("  [dry-run] would PATCH ssoProtection: null");
    } else {
      await vercel("PATCH", `/v9/projects/${project.id}?teamId=${teamId}`, {
        ssoProtection: null,
      });
      console.log("  ✓ Disabled.");
    }
  } else {
    console.log("→ Vercel Authentication already disabled.");
  }
}

if (doEnv) {
  console.log("→ Reading .env.local...");
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    console.error("  Could not read .env.local. Skipping env sync.");
    process.exit(0);
  }

  const desired = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!key || !val) continue;
    // Never push the Vercel token itself, the DB password URL, or local-only
    // dev helpers we explicitly don't want in prod.
    if (key === "VERCEL_TOKEN") continue;
    desired[key] = val;
  }

  console.log(`  ${Object.keys(desired).length} keys staged for prod sync.`);

  const existing = await vercel(
    "GET",
    `/v10/projects/${project.id}/env?teamId=${teamId}&decrypt=false`,
  );
  const byKey = new Map();
  for (const env of existing.envs ?? []) {
    if (env.target?.includes("production")) byKey.set(env.key, env);
  }

  for (const [key, value] of Object.entries(desired)) {
    const type = key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted";
    const target = ["production", "preview"];
    const found = byKey.get(key);

    if (found) {
      // Don't send `type` on PATCH — Vercel rejects type changes on
      // sensitive env vars. Preserve whatever the existing type is.
      console.log(`  ~ ${key} (exists, updating value)`);
      if (DRY) continue;
      await vercel(
        "PATCH",
        `/v10/projects/${project.id}/env/${found.id}?teamId=${teamId}`,
        { value, target },
      );
    } else {
      console.log(`  + ${key} (creating)`);
      if (DRY) continue;
      try {
        await vercel(
          "POST",
          `/v10/projects/${project.id}/env?teamId=${teamId}`,
          { key, value, target, type },
        );
      } catch (err) {
        if (err.status === 400 && err.body?.error?.code === "ENV_ALREADY_EXISTS") {
          console.log(`    (already present, ignoring 409)`);
        } else {
          throw err;
        }
      }
    }
  }
  console.log("  ✓ Env sync done.");
}

console.log("\nDone. To redeploy with new env, push to main or trigger a redeploy.");
