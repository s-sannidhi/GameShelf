import { useState } from 'react';
import { playstationApi } from '../api';

interface PlayStationSyncProps {
  onSynced: () => void;
}

const NPSSO_URL = 'https://ca.account.sony.com/api/v1/ssocookie';
const SIGNIN_URL = 'https://www.playstation.com/';

export function PlayStationSync({ onSynced }: PlayStationSyncProps) {
  const [npsso, setNpsso] = useState('');
  const [rememberForAutoSync, setRememberForAutoSync] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number; total: number } | null>(null);

  const handleSync = async () => {
    const token = npsso.trim();
    if (!token) {
      setError('Paste your NPSSO token.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await playstationApi.sync(token, rememberForAutoSync);
      setResult(data);
      onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="steam-sync playstation-sync">
      <h3 className="steam-sync-title">Sync from PlayStation</h3>
      <p className="steam-sync-hint">
        We use your PSN trophy list (games you’ve played). No server API key needed. To get your token: log in at{' '}
        <a href={SIGNIN_URL} target="_blank" rel="noopener noreferrer" className="steam-sync-id-link">
          playstation.com
        </a>
        , then open your{' '}
        <a href={NPSSO_URL} target="_blank" rel="noopener noreferrer" className="steam-sync-id-link">
          NPSSO token
        </a>
        {' '}in the same browser—copy the <code>npsso</code> value from the JSON and paste it below.
      </p>
      <div className="steam-sync-form">
        <input
          type="text"
          placeholder="Paste NPSSO token (64 characters)"
          value={npsso}
          onChange={(e) => setNpsso(e.target.value)}
          className="steam-sync-input"
          aria-label="NPSSO token"
        />
        <label className="steam-sync-remember">
          <input
            type="checkbox"
            checked={rememberForAutoSync}
            onChange={(e) => setRememberForAutoSync(e.target.checked)}
          />
          Remember for auto-sync
        </label>
        <button type="button" className="btn-primary steam-sync-btn" onClick={handleSync} disabled={loading || !npsso.trim()}>
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
