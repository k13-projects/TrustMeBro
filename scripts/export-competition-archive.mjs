#!/usr/bin/env node
// Snapshot one football competition's full record out of Postgres into JSON.
// Usage: node --env-file=.env.local scripts/export-competition-archive.mjs <competition> <out-dir>
//   e.g. node --env-file=.env.local scripts/export-competition-archive.mjs fifa.world docs/archive/world-cup-2026
//
// The database keeps every row (nothing is deleted when a competition is
// archived); this is belt-and-braces — a committed, human-readable copy of
// the ledger, every graded pick, every result and the final tables, so the
// record survives even a database accident. News is left out (11k rows).

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const [, , competition, outDir] = process.argv;
if (!competition || !outDir) {
  console.error(
    "Usage: node --env-file=.env.local scripts/export-competition-archive.mjs <competition> <out-dir>",
  );
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (see .env.example).");
  process.exit(2);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const q = async (sql, params) => (await client.query(sql, params)).rows;

const teams = await q(
  `select distinct t.* from soccer_teams t
     join soccer_matches m on m.home_team_id = t.id or m.away_team_id = t.id
    where m.competition = $1 order by t.name`,
  [competition],
);
const matches = await q(
  `select m.*, h.name as home_name, a.name as away_name
     from soccer_matches m
     join soccer_teams h on h.id = m.home_team_id
     join soccer_teams a on a.id = m.away_team_id
    where m.competition = $1 order by m.datetime`,
  [competition],
);
const standings = await q(
  `select s.*, t.name as team_name from soccer_standings s
     join soccer_teams t on t.id = s.team_id
    where s.competition = $1
      and s.captured_at = (select max(captured_at) from soccer_standings where competition = $1)
    order by s.grp, s.rank`,
  [competition],
);
const predictions = await q(
  `select p.*, h.name as home_name, a.name as away_name, m.date as match_date,
          m.home_score, m.away_score
     from soccer_predictions p
     join soccer_matches m on m.id = p.match_id
     join soccer_teams h on h.id = m.home_team_id
     join soccer_teams a on a.id = m.away_team_id
    where p.competition = $1 order by p.generated_at`,
  [competition],
);
const ledger = await q(`select * from soccer_ledgers where competition = $1`, [competition]);
const history = await q(
  `select * from soccer_system_score_history where competition = $1 order by recorded_at`,
  [competition],
);
const coupons = await q(
  `select c.*, coalesce(json_agg(l.soccer_prediction_id order by l.leg_order)
            filter (where l.soccer_prediction_id is not null), '[]') as leg_prediction_ids
     from engine_coupons c
     left join engine_coupon_legs l on l.coupon_id = c.id
    where c.sport = 'soccer' and c.competition = $1
    group by c.id order by c.generated_at`,
  [competition],
);
await client.end();

const dir = resolve(process.cwd(), outDir);
mkdirSync(dir, { recursive: true });
const write = (name, data) => {
  writeFileSync(resolve(dir, name), JSON.stringify(data, null, 2) + "\n");
  console.log(`  ${name.padEnd(22)} ${Array.isArray(data) ? data.length : 1} rows`);
};

console.log(`→ ${competition} → ${outDir}`);
write("meta.json", {
  competition,
  exported_at: new Date().toISOString(),
  counts: {
    teams: teams.length,
    matches: matches.length,
    standings: standings.length,
    predictions: predictions.length,
    history: history.length,
    coupons: coupons.length,
  },
});
write("ledger.json", ledger);
write("score-history.json", history);
write("predictions.json", predictions);
write("engine-coupons.json", coupons);
write("matches.json", matches);
write("standings-final.json", standings);
write("teams.json", teams);
console.log("✓ Archive written.");
