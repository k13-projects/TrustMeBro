// Plain-English definitions for the words this site uses without thinking.
// One or two short sentences each, no jargon inside the definition, and
// honest where a term is easy to misread ("value" is the big one).

export type GlossaryEntry = { term: string; short: string; long?: string };

export const GLOSSARY = {
  banko: {
    term: "BANKO",
    short: "The engine's most confident picks of the round.",
    long: "A pick is flagged BANKO when our probability for it is high enough that we would back it first. It is still a bet, not a certainty.",
  },
  devigged: {
    term: "De-vigged",
    short: "The bookmaker's own margin stripped out of a price.",
    long: "Bookmakers build a cut into their odds, so their numbers add up to more than 100%. Removing it leaves what the market really thinks each outcome's chance is.",
  },
  consensus: {
    term: "Consensus",
    short: "The average view across about forty bookmakers.",
    long: "Rather than trusting one book, we strip each one's margin and average them. One outlier moves the number very little.",
  },
  implied: {
    term: "Implied probability",
    short: "The chance a price is quietly claiming.",
    long: "Divide one by the decimal odds. A price of 2.00 implies a 50% chance; 4.00 implies 25%.",
  },
  edge: {
    term: "Edge",
    short: "How far our probability sits above what the price implies.",
    long: "If we make something 45% and the best price implies 42%, the edge is three points. It is a measure of price, not of likelihood.",
  },
  ev: {
    term: "Expected value",
    short: "What a one-unit bet returns on average, in theory.",
    long: "Our probability multiplied by the decimal odds, minus one. Positive means the price is generous by our numbers; it says nothing about any single result.",
  },
  value: {
    term: "Value",
    short: "A price that looks too generous for the outcome.",
    long: "Value does not mean likely to win. A 20% shot at a 10.00 price is value and still loses four times in five.",
  },
  unit: {
    term: "Unit",
    short: "One flat stake, whatever size you play.",
    long: "The ledger counts in units so results do not depend on how much anyone actually staked. One win is plus one, one loss is minus one.",
  },
  void: {
    term: "Void",
    short: "A pick that could not win or lose.",
    long: "Usually the total landed exactly on the line. Nothing is added to or taken from the ledger.",
  },
  push: {
    term: "Push",
    short: "Another word for void: the bet is a tie and the stake comes back.",
  },
  line: {
    term: "Line",
    short: "The number a bet is measured against.",
    long: "For total goals, the line is the goals figure you are betting over or under, like 2.5.",
  },
  overUnder: {
    term: "Over / Under",
    short: "Whether the two teams together score more or fewer goals than the line.",
  },
  btts: {
    term: "Both teams to score",
    short: "Yes if each side scores at least one goal, no if either is kept out.",
  },
  matchday: {
    term: "Matchday",
    short: "One full round of league-phase fixtures.",
    long: "In the Champions League there are eight, spread across the season, with weeks between them.",
  },
  leaguePhase: {
    term: "League phase",
    short: "One table of thirty-six clubs, eight matches each.",
    long: "The top eight go straight to the Round of 16, ninth to twenty-fourth play off for the rest, and the bottom twelve are out.",
  },
  aggregate: {
    term: "Aggregate",
    short: "Both legs of a knockout tie added together.",
    long: "A club losing 1–0 away and winning 2–0 at home goes through 2–1 on aggregate.",
  },
  hitRate: {
    term: "Hit rate",
    short: "The share of settled picks that won.",
    long: "Voids are left out, because they neither won nor lost.",
  },
  roi: {
    term: "ROI",
    short: "Profit as a share of everything staked.",
    long: "Measured at flat one-unit stakes and the best price available when the pick was made.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;

export const GLOSSARY_ORDER: GlossaryKey[] = [
  "banko",
  "value",
  "edge",
  "ev",
  "devigged",
  "consensus",
  "implied",
  "line",
  "overUnder",
  "btts",
  "unit",
  "void",
  "push",
  "hitRate",
  "roi",
  "matchday",
  "leaguePhase",
  "aggregate",
];
