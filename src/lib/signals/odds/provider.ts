import type { RawEvent, RequestCredits } from "./types";

export type FetchResult<T> = {
  data: T;
  credits: RequestCredits;
};

export interface OddsProvider {
  /** List NBA events scheduled in the API's date window. */
  listEvents(): Promise<FetchResult<RawEvent[]>>;
  /**
   * Pull player-prop odds for a single event. One API call per event; this is
   * the expensive surface (10x credits on The Odds API).
   */
  listPlayerPropsForEvent(
    eventId: string,
    homeTeam: string,
    awayTeam: string,
  ): Promise<FetchResult<RawPlayerPropOutcome[]>>;
}

export type RawPlayerPropOutcome = {
  market_key: string;
  bookmaker_key: string;
  player_name: string;
  line: number;
  side: "over" | "under";
  price_decimal: number;
};

export function americanFromDecimal(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}
