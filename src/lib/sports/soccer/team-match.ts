// Pure name reconciliation between ESPN team names (what we store) and the
// spellings bookmakers use (The Odds API). No DB, no fetch — testable.
//
// Country names mostly differ by one canonical alias (Türkiye/Turkey). Club
// names diverge freely ("Slavia Praha" vs "Slavia Prague", "Sabah FK" vs
// "Sabah", "Inter" vs "Internazionale"), so clubs get: explicit aliases, then
// token overlap after stripping diacritics and club-suffix noise, scored per
// pairing so "Manchester United" can't be confused with "Manchester City".

const COUNTRY_ALIASES: Record<string, string> = {
  "dr congo": "congo dr",
  "democratic republic of the congo": "congo dr",
  "congo democratic republic": "congo dr",
  "south korea": "korea republic",
  "north korea": "korea dr",
  "ivory coast": "cote divoire",
  "cape verde": "cabo verde",
  "ir iran": "iran",
  turkiye: "turkey",
  "united states": "usa",
  "united states of america": "usa",
  "republic of ireland": "ireland",
  czechia: "czech republic",
};

// Bookmaker spelling → ESPN spelling, both pre-normalized (lowercase, no
// diacritics). Only the pairs token overlap can't resolve on its own.
const CLUB_ALIASES: Record<string, string> = {
  "slavia praha": "slavia prague",
  "sparta praha": "sparta prague",
  inter: "internazionale",
  "inter milan": "internazionale",
  "fc internazionale milano": "internazionale",
  "athletic bilbao": "athletic club",
  psg: "paris saint-germain",
  "paris sg": "paris saint-germain",
  "bayern munchen": "bayern munich",
  "fc bayern munchen": "bayern munich",
  "sporting lisbon": "sporting cp",
  "sporting clube de portugal": "sporting cp",
  "fc copenhagen": "fc kobenhavn",
  "red star belgrade": "crvena zvezda",
  "crvena zvezda": "red star belgrade",
  olympiakos: "olympiacos",
  "olympiakos piraeus": "olympiacos",
  "union saint-gilloise": "union st-gilloise",
  "royale union sg": "union st-gilloise",
  "union sg": "union st-gilloise",
  "bodo glimt": "bodo/glimt",
  "fk bodo/glimt": "bodo/glimt",
  "bodoe/glimt": "bodo/glimt",
  "shakhtar donetsk": "shakhtar donetsk",
  marseille: "olympique marseille",
  "olympique de marseille": "olympique marseille",
  lyon: "lyon",
  "olympique lyonnais": "lyon",
  monaco: "as monaco",
  "as monaco fc": "as monaco",
  "manchester utd": "manchester united",
  "man united": "manchester united",
  "man utd": "manchester united",
  "man city": "manchester city",
  "tottenham": "tottenham hotspur",
  "spurs": "tottenham hotspur",
  "wolves": "wolverhampton wanderers",
  "brighton": "brighton & hove albion",
  "newcastle": "newcastle united",
  "leverkusen": "bayer leverkusen",
  "dortmund": "borussia dortmund",
  "gladbach": "borussia monchengladbach",
  "frankfurt": "eintracht frankfurt",
  "stuttgart": "vfb stuttgart",
  "leipzig": "rb leipzig",
  "atletico madrid": "atletico madrid",
  "atletico de madrid": "atletico madrid",
  "real sociedad": "real sociedad",
  "betis": "real betis",
  "sevilla": "sevilla",
  "porto": "fc porto",
  "benfica": "benfica",
  "sl benfica": "benfica",
  "braga": "sporting braga",
  "sc braga": "sporting braga",
  "psv": "psv eindhoven",
  "feyenoord": "feyenoord rotterdam",
  "ajax": "ajax amsterdam",
  "afc ajax": "ajax amsterdam",
  "az": "az alkmaar",
  "brugge": "club brugge",
  "club brugge kv": "club brugge",
  "fenerbahce sk": "fenerbahce",
  "galatasaray sk": "galatasaray",
  "besiktas jk": "besiktas",
  "salzburg": "red bull salzburg",
  "fc salzburg": "red bull salzburg",
  "sturm graz": "sk sturm graz",
  "young boys": "bsc young boys",
  "celtic fc": "celtic",
  "rangers fc": "rangers",
  "dinamo zagreb": "dinamo zagreb",
  "gnk dinamo zagreb": "dinamo zagreb",
  "qarabag fk": "qarabag",
  "kairat": "kairat almaty",
  "pafos": "pafos fc",
  "sabah": "sabah fk",
  "sabah fk": "sabah fk",
  "como 1907": "como",
  "lens": "lens",
  "rc lens": "lens",
  "lille": "lille",
  "losc lille": "lille",
  "napoli": "napoli",
  "ssc napoli": "napoli",
  "roma": "as roma",
  "juventus": "juventus",
  "atalanta": "atalanta",
  "atalanta bc": "atalanta",
  "ac milan": "ac milan",
  "milan": "ac milan",
  "lask": "lask linz",
  "viking": "viking fk",
  "viking fk": "viking fk",
  "aek": "aek athens",
  "aek athens fc": "aek athens",
  "slovan bratislava": "slovan bratislava",
  "sk slovan bratislava": "slovan bratislava",
  "villarreal cf": "villarreal",
  "fc barcelona": "barcelona",
  "real madrid cf": "real madrid",
  "liverpool fc": "liverpool",
  "arsenal fc": "arsenal",
  "chelsea fc": "chelsea",
  "aston villa fc": "aston villa",
  "fc porto": "fc porto",
  "bayern": "bayern munich",
};

// Tokens that carry no identity (legal forms, generic words, founding years).
const NOISE = new Set([
  "fc", "cf", "sc", "sk", "ac", "as", "rc", "fk", "nk", "hnk", "bk", "if",
  "ff", "sv", "vfb", "vfl", "bsc", "ssc", "us", "afc", "kv", "cp", "sl", "fh",
  "ki", "jk", "club", "clube", "de", "du", "da", "the", "and", "&", "cd",
  "1907", "1899", "1909", "1904", "1900", "1893", "04", "05", "09", "96",
]);

export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Canonical form: aliases first (both country and club tables), then the
// normalized string.
export function canonicalTeamName(name: string): string {
  const base = normalizeTeamName(name);
  return COUNTRY_ALIASES[base] ?? CLUB_ALIASES[base] ?? base;
}

function tokens(name: string): string[] {
  return canonicalTeamName(name)
    .replace(/[-/]/g, " ")
    .split(" ")
    .filter((t) => t && !NOISE.has(t));
}

// 0..1 similarity between two team names. 1 = canonical-equal. Otherwise the
// Dice coefficient over identity tokens, with a floor bonus when one name is
// wholly contained in the other ("Sabah" ⊂ "Sabah FK").
export function teamSimilarity(a: string, b: string): number {
  const ca = canonicalTeamName(a);
  const cb = canonicalTeamName(b);
  if (ca === cb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  if (shared === 0) return 0;
  const dice = (2 * shared) / (ta.length + tb.length);
  const contained = shared === Math.min(ta.length, tb.length);
  return Math.max(dice, contained ? 0.75 : 0);
}

export type MatchCandidate<T> = {
  match: T;
  home: string;
  away: string;
};

// Pick the DB match a bookmaker event refers to, among candidates on the same
// day. Requires both sides to clear the threshold and prefers the pairing with
// the highest combined similarity; a tie or a weak best ⇒ null (never guess).
export function resolveMatch<T>(
  ev: { home_team: string; away_team: string },
  candidates: MatchCandidate<T>[],
  threshold = 0.6,
): T | null {
  let best: { match: T; score: number } | null = null;
  let runnerUp = 0;
  for (const c of candidates) {
    const h = teamSimilarity(ev.home_team, c.home);
    const a = teamSimilarity(ev.away_team, c.away);
    if (h < threshold || a < threshold) continue;
    const score = h + a;
    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0;
      best = { match: c.match, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }
  if (!best) return null;
  if (best.score - runnerUp < 0.15 && runnerUp > 0) return null;
  return best.match;
}
