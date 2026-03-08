import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { metadataApi, gamesApi } from '../api';
import type { MetadataSearchResult } from '../types';

interface AddGameProps {
  onClose: () => void;
  onAdded: () => void;
}

const PLATFORMS = ['Steam', 'Epic', 'PlayStation', 'Xbox', 'Nintendo', 'Other'] as const;

export function AddGame({ onClose, onAdded }: AddGameProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MetadataSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('Other');
  const [adding, setAdding] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await metadataApi.search(query.trim());
      setResults(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Search failed';
      // If they see an old IGDB message (cached or old server), show RAWG instructions instead
      const show = /metadata not configured|503|CLIENT_ID|CLIENT_SECRET|RAWG|IGDB/i.test(msg)
        ? 'Metadata not configured. Add either RAWG_API_KEY (rawg.io) or TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (dev.twitch.tv/console) to .env, then restart the server.'
        : msg;
      setError(show);
    } finally {
      setLoading(false);
    }
  };

  const addFromResult = async (r: MetadataSearchResult) => {
    setAdding(true);
    setError(null);
    try {
      let boxArtUrl: string | null = null;
      try {
        const details = await metadataApi.getGame(r.id);
        boxArtUrl = details.boxArtUrl ?? null;
      } catch {
        // use spine/cover only if box art fetch fails
      }
      await gamesApi.create({
        name: r.name,
        platform,
        source: 'manual',
        externalId: String(r.id),
        coverUrl: r.coverUrl,
        boxArtUrl: boxArtUrl ?? undefined,
        description: r.summary,
        releaseDate: r.releaseDate,
      });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add game');
    } finally {
      setAdding(false);
    }
  };

  const addManual = async () => {
    if (!query.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await gamesApi.create({
        name: query.trim(),
        platform,
        source: 'manual',
      });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add game');
    } finally {
      setAdding(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal add-game-modal"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Add game</h2>
          <div className="add-game-form">
            <label>
              Platform
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Search by name (fetches cover &amp; description from RAWG)
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="Game name"
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={search} disabled={loading}>
                {loading ? 'Searching…' : 'Search'}
              </button>
              <button type="button" onClick={addManual} disabled={adding || !query.trim()}>
                Add without metadata
              </button>
            </div>
          </div>
          {error && <p className="modal-error">{error}</p>}
          {results && (
            <div className="search-results">
              <h3>Pick a match or add manually above</h3>
              <ul>
                {results.map((r) => (
                  <li key={r.id}>
                    {r.coverUrl && <img src={r.coverUrl} alt="" />}
                    <div>
                      <strong>{r.name}</strong>
                      {r.releaseDate && <span> · {r.releaseDate}</span>}
                    </div>
                    <button type="button" onClick={() => addFromResult(r)} disabled={adding}>
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="modal-close" onClick={onClose}>
            Cancel
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
