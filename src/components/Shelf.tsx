import { GameSpine } from './GameSpine';
import type { Game } from '../types';

/** Size tier so spine dimensions scale with game count (few = bigger, many = smaller). */
function getShelfSizeTier(count: number): 'few' | 'medium' | 'many' {
  if (count <= 6) return 'few';
  if (count <= 18) return 'medium';
  return 'many';
}

/** Max spines per shelf so one row fills ~one ledge (wider box-art spines = fewer per row). */
function getMaxPerShelf(tier: 'few' | 'medium' | 'many'): number {
  switch (tier) {
    case 'few':
      return 6;
    case 'medium':
      return 8;
    case 'many':
      return 10;
  }
}

interface ShelfProps {
  games: Game[];
  onSelectGame: (game: Game) => void;
}

export function Shelf({ games, onSelectGame }: ShelfProps) {
  if (games.length === 0) {
    return (
      <div className="shelf-empty">
        <p>No games yet. Add games with the button above.</p>
      </div>
    );
  }

  const tier = getShelfSizeTier(games.length);
  const maxPerShelf = getMaxPerShelf(tier);
  const chunks: Game[][] = [];
  for (let i = 0; i < games.length; i += maxPerShelf) {
    chunks.push(games.slice(i, i + maxPerShelf));
  }

  return (
    <div className="shelf-container">
      {chunks.map((chunk, index) => (
        <div key={index} className="shelf-row">
          <div className={`shelf-spines shelf-count-${tier}`}>
            {chunk.map((game) => (
              <GameSpine key={game.id} game={game} onClick={() => onSelectGame(game)} />
            ))}
          </div>
          <div className="shelf-surface" />
        </div>
      ))}
    </div>
  );
}
