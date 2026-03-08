import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Game } from '../types';

interface GameSpineProps {
  game: Game;
  onClick: () => void;
}

export function GameSpine({ game, onClick }: GameSpineProps) {
  const spineUrl = game.spineCoverUrl?.trim() || undefined;
  const fallbackUrl = game.coverUrl || undefined;
  const [useFallback, setUseFallback] = useState(false);
  const coverUrl = useFallback ? fallbackUrl : (spineUrl || fallbackUrl);

  return (
    <motion.button
      type="button"
      className="game-spine"
      onClick={onClick}
      whileHover={{ scale: 1.05, zIndex: 10 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="spine-inner">
        <div className="spine-cover">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              loading="lazy"
              onError={() => {
                if (!useFallback && spineUrl && fallbackUrl) setUseFallback(true);
              }}
            />
          ) : (
            <div className="spine-placeholder">
              <span>{game.name.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
        </div>
        <div className="spine-title">{game.name}</div>
      </div>
    </motion.button>
  );
}
