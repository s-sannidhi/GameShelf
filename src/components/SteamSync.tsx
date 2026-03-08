import { useState } from 'react';
import { steamApi } from '../api';

interface SteamSyncProps {
  onSynced: () => void;
}

export function SteamSync({ onSynced }: SteamSyncProps) {
  const [steamId, setSteamId] = useState('');
  const [rememberForAutoSync, setRememberForAutoSync] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number; total: number } | null>(null);

  const handleSync = async () => {
    const id = steamId.trim();
    if (!id) {
      setError('Paste your Steam profile link or 64-bit ID.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await steamApi.sync(id, rememberForAutoSync);
      setResult(data);
      onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="steam-sync">
      <h3 className="steam-sync-title">Sync from Steam</h3>
      <p className="steam-sync-hint">
        Server needs STEAM_API_KEY in .env. Paste your{' '}
        <a
          href="https://steamcommunity.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="steam-sync-id-link"
        >
          Steam profile link
        </a>
        {' '}(e.g. steamcommunity.com/id/YourName)—we use Steam’s API to look up your library. No need to find the numeric ID.
      </p>
      <div className="steam-sync-form">
        <input
          type="text"
          placeholder="Paste profile link or 64-bit ID"
          value={steamId}
          onChange={(e) => setSteamId(e.target.value)}
          className="steam-sync-input"
          aria-label="Steam profile URL or ID"
        />
        <label className="steam-sync-remember">
          <input
            type="checkbox"
            checked={rememberForAutoSync}
            onChange={(e) => setRememberForAutoSync(e.target.checked)}
          />
          Remember for auto-sync
        </label>
        <button type="button" className="btn-primary steam-sync-btn" onClick={handleSync} disabled={loading || !steamId.trim()}>
          {loading ? 'Syncing…' : 'Sync library'}
        </button>
      </div>
      {error && <p className="steam-sync-error">{error}</p>}
      {result && (
        <p className="steam-sync-result">
          Done: {result.added} added, {result.updated} updated (of {result.total} games).
        </p>
      )}
    </div>
  );
}
