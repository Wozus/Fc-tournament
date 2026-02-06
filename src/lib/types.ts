export type PlayerStats = {
  goals: number;
  crossbars: number;
  blackPosts: number;
  club?: string;
  host?: boolean;
};

export type Match = {
  id?: string;
  tournamentId?: string;
  no: number;
  winner?: string | null;
  specialText?: string | null;
  specialPlayers?: string[];
  pointsMultiplier?: number;
  players: Record<string, PlayerStats>;
  createdAt?: string;
};

export type MatchInput = {
  no: number;
  winner?: string | null;
  specialText?: string | null;
  specialPlayers?: string[];
  pointsMultiplier?: number;
  players: Record<string, PlayerStats>;
};

export type Tournament = {
  id: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
  players: string[];
  createdAt?: string;
};

export type TournamentListItem = {
  id: string;
  name: string;
  ownerUsername: string;
  createdAt?: string;
};

export type PlayerTotals = {
  goals: number;
  crossbars: number;
  blackPosts: number;
  wins: number;
  totalPoints: number;
};
