import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Shelf } from './components/Shelf';
import { GameDetail } from './components/GameDetail';
import { AddGame } from './components/AddGame';
import { SteamSync } from './components/SteamSync';
import { PlayStationSync } from './components/PlayStationSync';
import { Landing } from './components/Landing';
import { FriendsView } from './components/FriendsView';
import { ProfileSettings } from './components/ProfileSettings';
import { useAuth } from './contexts/AuthContext';
import { gamesApi, syncApi } from './api';
import type { Game } from './types';

function App() {
  const { user, loading: authLoading, logout } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);
  const [showSteamSync, setShowSteamSync] = useState(false);
  const [showPlayStationSync, setShowPlayStationSync] = useState(false);
  const [view, setView] = useState<'library' | 'friends' | 'profile'>('library');
  const [filter, setFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<string>('asc');

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { sortBy, sortOrder };
      if (filter) params.filter = filter;
      const data = await gamesApi.list(params);
      setGames(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, [filter, sortBy, sortOrder]);

  useEffect(() => {
    if (!user) {
      setGames([]);
      return;
    }
    let cancelled = false;
    syncApi
      .auto()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) fetchGames();
      });
    return () => {
      cancelled = true;
    };
  }, [user, fetchGames]);

  const handleUpdateGame = (updated: Game) => {
    setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setSelectedGame((s) => (s?.id === updated.id ? updated : s));
  };

  if (authLoading) {
    return (
      <div className="app app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Game Shelf</h1>
        <div className="header-actions">
          <nav className="main-nav">
            <button type="button" className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>Library</button>
            <button type="button" className={view === 'friends' ? 'active' : ''} onClick={() => setView('friends')}>Friends</button>
            <button type="button" className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}>Profile</button>
          </nav>
          {view === 'library' && <div className="filters">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter"
            >
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In progress</option>
              <option value="backlog">Backlog</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort by"
            >
              <option value="name">Name</option>
              <option value="completedAt">Completion date</option>
              <option value="playtimeMinutes">Playtime</option>
              <option value="releaseDate">Release date</option>
            </select>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              aria-label="Sort order"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>}
          {view === 'library' && (
            <>
              <button type="button" className="btn-secondary" onClick={() => setShowSteamSync((s) => !s)}>
                Sync Steam
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowPlayStationSync((s) => !s)}>
                Sync PlayStation
              </button>
              <button type="button" className="btn-primary" onClick={() => setShowAddGame(true)}>
                Add game
              </button>
            </>
          )}
          <span className="header-divider" aria-hidden />
          <span className="header-user">{user.username}</span>
          <button type="button" className="btn-secondary" onClick={() => logout()}>
            Logout
          </button>
        </div>
      </header>

      <main className="app-main">
        {view === 'friends' && <FriendsView />}
        {view === 'profile' && <ProfileSettings onSynced={fetchGames} />}
        {view === 'library' && (
          <>
            {showSteamSync && (
              <div className="library-steam-sync">
                <SteamSync onSynced={fetchGames} />
              </div>
            )}
            {showPlayStationSync && (
              <div className="library-steam-sync">
                <PlayStationSync onSynced={fetchGames} />
              </div>
            )}
            {loading && <p className="loading">Loading library…</p>}
            {error && <p className="error">{error}</p>}
            {!loading && !error && (
              <Shelf games={games} onSelectGame={setSelectedGame} />
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {selectedGame && (
          <GameDetail
            game={selectedGame}
            onClose={() => setSelectedGame(null)}
            onUpdate={handleUpdateGame}
            onDelete={(g) => {
              setGames((prev) => prev.filter((x) => x.id !== g.id));
              setSelectedGame(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddGame && (
          <AddGame
            onClose={() => setShowAddGame(false)}
            onAdded={fetchGames}
          />
        )}
      </AnimatePresence>

    </div>
  );
}

export default App;
