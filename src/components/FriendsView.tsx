import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { friendsApi } from '../api';
import type { Friend, FriendRequest, MutualGame } from '../types';

export function FriendsView() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [addUsername, setAddUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutualFriendId, setMutualFriendId] = useState<number | null>(null);
  const [mutualGames, setMutualGames] = useState<MutualGame[]>([]);
  const [mutualLoading, setMutualLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, r] = await Promise.all([friendsApi.list(), friendsApi.requests()]);
      setFriends(f);
      setRequests(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsername.trim()) return;
    setError(null);
    try {
      await friendsApi.request(addUsername.trim());
      setAddUsername('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send request');
    }
  };

  const handleAccept = async (id: number) => {
    try {
      await friendsApi.acceptRequest(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept');
    }
  };

  const handleDecline = async (id: number) => {
    try {
      await friendsApi.declineRequest(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decline');
    }
  };

  const showMutual = async (friendId: number) => {
    setMutualFriendId(friendId);
    setMutualLoading(true);
    setMutualGames([]);
    try {
      const list = await friendsApi.mutualGames(friendId);
      setMutualGames(list);
    } catch {
      setMutualGames([]);
    } finally {
      setMutualLoading(false);
    }
  };

  const friendForMutual = mutualFriendId ? friends.find((f) => f.id === mutualFriendId) : null;

  return (
    <div className="friends-view">
      <h2>Friends</h2>
      <form onSubmit={handleAddFriend} className="friends-add">
        <input
          type="text"
          value={addUsername}
          onChange={(e) => setAddUsername(e.target.value)}
          placeholder="Username to add"
        />
        <button type="submit">Add friend</button>
      </form>
      {error && <p className="friends-error">{error}</p>}
      {loading && <p className="friends-loading">Loading…</p>}
      {!loading && (
        <>
          {requests.length > 0 && (
            <section className="friends-section">
              <h3>Friend requests</h3>
              <ul className="friends-list">
                {requests.map((r) => (
                  <li key={r.id}>
                    <span>{r.username}</span>
                    <div>
                      <button type="button" onClick={() => handleAccept(r.id)}>Accept</button>
                      <button type="button" onClick={() => handleDecline(r.id)}>Decline</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="friends-section">
            <h3>Your friends</h3>
            {friends.length === 0 ? (
              <p className="friends-empty">No friends yet. Add someone by username above.</p>
            ) : (
              <ul className="friends-list">
                {friends.map((f) => (
                  <li key={f.id}>
                    <span>{f.username}</span>
                    <button type="button" onClick={() => showMutual(f.id)}>Compare library</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <AnimatePresence>
            {mutualFriendId != null && (
              <motion.div
                className="mutual-panel"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="mutual-header">
                  <h3>Mutual games {friendForMutual ? `with ${friendForMutual.username}` : ''}</h3>
                  <button type="button" onClick={() => { setMutualFriendId(null); setMutualGames([]); }}>Close</button>
                </div>
                {mutualLoading && <p>Loading…</p>}
                {!mutualLoading && mutualGames.length === 0 && friendForMutual && <p>No games in common.</p>}
                {!mutualLoading && mutualGames.length > 0 && (
                  <ul className="mutual-games">
                    {mutualGames.map((g) => (
                      <li key={g.id}>
                        {g.coverUrl && <img src={g.coverUrl} alt="" />}
                        <div>
                          <strong>{g.name}</strong>
                          {g.releaseDate && <span> · {g.releaseDate}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
