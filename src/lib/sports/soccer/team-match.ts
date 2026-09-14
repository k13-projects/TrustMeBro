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
  "salzburg": "rb salzburg",
  "fc salzburg": "rb salzburg",
  "red bull salzburg": "rb salzburg",
  "omonoia": "omonia nicosia",
  "omonoia fc": "omonia nicosia",
  "omonia": "omonia nicosia",
  "rennes": "stade rennais",
  "stade rennais fc": "stade rennais",
  "nice": "nice",
  "ogc nice": "nice",
  "lille osc": "lille",
  "fc utrecht": "utrecht",
  "go ahead eagles": "go ahead eagles",
  "ferencvaros": "ferencvaros",
  "ferencvarosi tc": "ferencvaros",
  "fcsb": "fcsb",
  "midtjylland": "fc midtjylland",
  "fc midtjylland": "fc midtjylland",
  "brann": "sk brann",
  "malmo ff": "malmo",
  "malmo": "malmo",
  "young boys bern": "bsc young boys",
  "basel": "fc basel",
  "fc basel 1893": "fc basel",
  "genk": "genk",
  "krc genk": "genk",
  "real betis balompie": "real betis",
  "nottingham forest": "nottingham forest",
  "nottm forest": "nottingham forest",
  "panathinaikos": "panathinaikos",
  "paok": "paok salonika",
  "paok saloniki": "paok salonika",
  "paok thessaloniki": "paok salonika",
  "maccabi tel aviv": "maccabi tel aviv",
  "dinamo zagreb": "dinamo zagreb",
  "ludogorets": "ludogorets razgrad",
  "ludogorets razgrad": "ludogorets razgrad",
  "celtic glasgow": "celtic",
  "glasgow rangers": "rangers",
  "crvena zvezda beograd": "red star belgrade",
  "sc freiburg": "sc freiburg",
  "freiburg": "sc freiburg",
  "vfb stuttgart": "vfb stuttgart",
  "bologna": "bologna",
  "bologna fc": "bologna",
  "fiorentina": "fiorentina",
  "acf fiorentina": "fiorentina",
  "lazio": "lazio",
  "ss lazio": "lazio",
  "aston villa": "aston villa",
  "crystal palace": "crystal palace",
  "fc porto": "fc porto",
  "shamrock rovers": "shamrock rovers",
  "legia warsaw": "legia warszawa",
  "legia warszawa": "legia warszawa",
  "rakow": "rakow czestochowa",
  "rakow czestochowa": "rakow czestochowa",
  "lech poznan": "lech poznan",
  "hacken": "bk hacken",
  "bk hacken": "bk hacken",
  "aek larnaca": "aek larnaca",
  "aek larnaka": "aek larnaca",
  "apoel": "apoel nicosia",
  "apoel nicosia": "apoel nicosia",
  "shakhtar": "shakhtar donetsk",
  "dynamo kyiv": "dynamo kyiv",
  "dynamo kiev": "dynamo kyiv",
  "sigma olomouc": "sigma olomouc",
  "viktoria plzen": "viktoria plzen",
  "fc viktoria plzen": "viktoria plzen",
  "sparta prague": "sparta prague",
  "slovan bratislava": "slovan bratislava",
  "zrinjski": "zrinjski mostar",
  "zrinjski mostar": "zrinjski mostar",
  "hamrun spartans": "hamrun spartans",
  "hjk": "hjk helsinki",
  "hjk helsinki": "hjk helsinki",
  "kups": "kups kuopio",
  "kups kuopio": "kups kuopio",
  "aberdeen": "aberdeen",
  "aberdeen fc": "aberdeen",
  "az alkmaar": "az alkmaar",
  "sporting braga": "sporting braga",
  "vitoria guimaraes": "vitoria de guimaraes",
  "vitoria sc": "vitoria de guimaraes",
  "rayo vallecano": "rayo vallecano",
  "mainz": "mainz",
  "1 fsv mainz 05": "mainz",
  "fsv mainz 05": "mainz",
  "strasbourg": "strasbourg",
  "rc strasbourg": "strasbourg",
  "rc strasbourg alsace": "strasbourg",
  "shelbourne": "shelbourne",
  "drita": "drita gjilan",
  "kf drita": "drita gjilan",
  "noah": "fc noah",
  "fc noah": "fc noah",
  "shkendija": "shkendija",
  "kf shkendija": "shkendija",
  "breidablik": "breidablik",
  "lincoln red imps": "lincoln red imps",
  "lincoln red imps fc": "lincoln red imps",
  "rijeka": "hnk rijeka",
  "hnk rijeka": "hnk rijeka",
  "samsunspor": "samsunspor",
  "besiktas": "besiktas",
  "universitatea craiova": "csu craiova",
  "cs universitatea craiova": "csu craiova",
  "u craiova": "csu craiova",
  "crystal palace fc": "crystal palace",
  "alkmaar": "az alkmaar",
  "fc lausanne-sport": "lausanne sport",
  "lausanne": "lausanne sport",
  "lausanne-sport": "lausanne sport",
  "jagiellonia": "jagiellonia bialystok",
  // How UEFA's own feed writes these, where no general rule would get there.
  atleti: "atletico madrid",
  paris: "paris saint-germain",
  "iberia tbilisi": "iberia 1999",
  hearts: "heart of midlothian",
  "at escaldes": "atletic club descaldes",
  "atletic escaldes": "atletic club descaldes",
  "h boltfelag": "hb torshavn",
  "havnar boltfelag": "hb torshavn",
  thun: "fc thun",
  copenhagen: "fc kobenhavn",
  kobenhavn: "fc kobenhavn",
  "inter escaldes": "inter descaldes",
  "sk rapid": "rapid vienna",
  "rapid wien": "rapid vienna",
  "sk rapid wien": "rapid vienna",
  "austria wien": "austria vienna",
  "fk austria wien": "austria vienna",
  borac: "borac banja luka",
  celje: "nk celje",
  aarhus: "agf",
  "gnk dinamo": "dinamo zagreb",
  "h beer-sheva": "hapoel beer",
  "hapoel beer-sheva": "hapoel beer",
  "inter turku": "inter turku",
  "gyori eto": "gyori eto fc",
  "the new saints": "the new saints",
  "b dortmund": "borussia dortmund",
  "s bratislava": "slovan bratislava",
  "m tel-aviv": "maccabi tel aviv",
  "sh donetsk": "shakhtar donetsk",
  "d zagreb": "dinamo zagreb",
  "r madrid": "real madrid",
  "a madrid": "atletico madrid",

  "sturm graz": "sk sturm graz",
  "young boys": "bsc young boys",
  "celtic fc": "celtic",
  "rangers fc": "rangers",
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
  "sk slovan bratislava": "slovan bratislava",
  "villarreal cf": "villarreal",
  "fc barcelona": "barcelona",
  "real madrid cf": "real madrid",
  "liverpool fc": "liverpool",
  "arsenal fc": "arsenal",
  "chelsea fc": "chelsea",
  "aston villa fc": "aston villa",
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
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
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

/**
 * Whether two name tokens refer to the same thing. UEFA abbreviates where
 * ESPN spells out — "S. Bratislava" for Slovan, "B. Dortmund" for Borussia,
 * "Vikingur R." for Reykjavík — so an initial matches a word starting with
 * it, and a shortened word matches the longer one it opens. Both sides of a
 * fixture still have to clear the bar in `resolveMatch`, and an ambiguous
 * best refuses to guess, so loosening this cannot silently mis-assign a score.
 */
function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  if (a.length >= 5 && b.startsWith(a)) return true;
  if (b.length >= 5 && a.startsWith(b)) return true;
  return false;
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
  const used = new Set<number>();
  let shared = 0;
  for (const t of ta) {
    const i = tb.findIndex((u, idx) => !used.has(idx) && tokenMatches(t, u));
    if (i >= 0) {
      used.add(i);
      shared += 1;
    }
  }
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
