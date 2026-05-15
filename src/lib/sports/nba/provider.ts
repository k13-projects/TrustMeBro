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

export interface NbaProvider {
  listTeams(): Promise<Team[]>;
  getTeam(id: number): Promise<Team | null>;
  searchPlayers(params: SearchPlayersParams): Promise<Paginated<Player>>;
  getPlayer(id: number): Promise<Player | null>;
  listGames(params: ListGamesParams): Promise<Paginated<Game>>;
  getGame(id: number): Promise<Game | null>;
  listStats(params: ListStatsParams): Promise<Paginated<Stat>>;
}
