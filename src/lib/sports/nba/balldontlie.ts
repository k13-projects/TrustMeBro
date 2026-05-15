import "server-only";

import type {
  Game,
  ListGamesParams,
  ListStatsParams,
  Paginated,
  Player,
  SearchPlayersParams,
  Stat,
  Team,
} from "../types";
import type { NbaProvider } from "./provider";

const BASE_URL = "https://api.balldontlie.io/v1";

type FetchOptions = {
  revalidate?: number;
  signal?: AbortSignal;
};

function getApiKey(): string {
  const key = process.env.BALLDONTLIE_API_KEY;
  if (!key) {
    throw new Error(
      "BALLDONTLIE_API_KEY is not set. Get a key at https://www.balldontlie.io and add it to .env.local",
    );
  }
  return key;
}

async function request<T>(
  path: string,
  query: Record<string, string | number | string[] | number[] | undefined> = {},
  opts: FetchOptions = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(`${k}[]`, String(item));
    } else {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    headers: { Authorization: getApiKey() },
    next: { revalidate: opts.revalidate ?? 60 },
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `balldontlie ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 200)}`,
    );
  }
  return res.json() as Promise<T>;
}

export class BalldontlieProvider implements NbaProvider {
  async listTeams(): Promise<Team[]> {
    const data = await request<{ data: Team[] }>(
      "/teams",
      {},
      { revalidate: 60 * 60 * 24 },
    );
    return data.data;
  }

  async getTeam(id: number): Promise<Team | null> {
    try {
      const data = await request<{ data: Team }>(
        `/teams/${id}`,
        {},
        { revalidate: 60 * 60 * 24 },
      );
      return data.data;
    } catch {
      return null;
    }
  }

  async searchPlayers(
    params: SearchPlayersParams,
  ): Promise<Paginated<Player>> {
    const data = await request<{
      data: Player[];
      meta: { next_cursor: number | null; per_page: number };
    }>("/players", { ...params }, { revalidate: 60 * 60 });
    return {
      data: data.data,
      next_cursor: data.meta.next_cursor,
      per_page: data.meta.per_page,
    };
  }

  async getPlayer(id: number): Promise<Player | null> {
    try {
      const data = await request<{ data: Player }>(
        `/players/${id}`,
        {},
        { revalidate: 60 * 60 },
      );
      return data.data;
    } catch {
      return null;
    }
  }

  async listGames(params: ListGamesParams): Promise<Paginated<Game>> {
    const data = await request<{
      data: Game[];
      meta: { next_cursor: number | null; per_page: number };
    }>("/games", { ...params }, { revalidate: 30 });
    return {
      data: data.data,
      next_cursor: data.meta.next_cursor,
      per_page: data.meta.per_page,
    };
  }

  async getGame(id: number): Promise<Game | null> {
    try {
      const data = await request<{ data: Game }>(
        `/games/${id}`,
        {},
        { revalidate: 30 },
      );
      return data.data;
    } catch {
      return null;
    }
  }

  async listStats(params: ListStatsParams): Promise<Paginated<Stat>> {
    const data = await request<{
      data: Stat[];
      meta: { next_cursor: number | null; per_page: number };
    }>("/stats", { ...params }, { revalidate: 60 });
    return {
      data: data.data,
      next_cursor: data.meta.next_cursor,
      per_page: data.meta.per_page,
    };
  }
}

let _provider: NbaProvider | null = null;

export function nbaProvider(): NbaProvider {
  if (!_provider) _provider = new BalldontlieProvider();
  return _provider;
}
