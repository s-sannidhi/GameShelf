import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Game, MetadataSearchResult } from '../types';
import { gamesApi, metadataApi, steamApi } from '../api';

const CAROUSEL_INTERVAL_MS = 4000;

interface GameDetailProps {
  game: Game | null;
  onClose: () => void;
  onUpdate: (game: Game) => void;
  onDelete: (game: Game) => void;
}

export function GameDetail({ game, onClose, onUpdate, onDelete }: GameDetailProps) {
  const [form, setForm] = useState<Partial<Game>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [artQuery, setArtQuery] = useState('');
  const [artResults, setArtResults] = useState<MetadataSearchResult[] | null>(null);
  const [artLoading, setArtLoading] = useState(false);
  const [artError, setArtError] = useState<string | null>(null);
  const [applyingArt, setApplyingArt] = useState(false);
  const [refreshArtLoading, setRefreshArtLoading] = useState(false);
  const [refreshArtError, setRefreshArtError] = useState<string | null>(null);
  const [steamAppIdInput, setSteamAppIdInput] = useState('');
  const [steamStoreArtLoading, setSteamStoreArtLoading] = useState(false);
  const [steamStoreArtError, setSteamStoreArtError] = useState<string | null>(null);

  function parseScreenshots(s: string | null | undefined): string[] {
    if (!s?.trim()) return [];
    try {
      const arr = JSON.parse(s) as unknown;
      return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === 'string') : [];
    } catch {
      return [];
    }
  }

  useEffect(() => {
    if (game) {
      setForm({
        completedAt: game.completedAt ?? undefined,
        playtimeMinutes: game.playtimeMinutes ?? undefined,
        rating: game.rating ?? undefined,
        notes: game.notes ?? undefined,
        storeUrl: game.storeUrl ?? undefined,
        description: game.description ?? undefined,
        genres: game.genres ?? undefined,
        developer: game.developer ?? undefined,
        publisher: game.publisher ?? undefined,
        trailerUrl: game.trailerUrl ?? undefined,
        tags: game.tags ?? undefined,
      });
      setError(null);
      setCarouselIndex(0);
      setArtResults(null);
      setArtError(null);
      setRefreshArtError(null);
      setSteamStoreArtError(null);
      setSteamAppIdInput(
        game.source === 'steam' && game.externalId ? String(game.externalId).trim() : ''
      );
      const stored = parseScreenshots(game.screenshots);
      const fallback = game.boxArtUrl ?? game.coverUrl;
      if (stored.length > 0) {
        setCarouselImages(stored);
      } else {
        setCarouselImages(fallback ? [fallback] : []);
        if (game.externalId) {
          metadataApi
            .getGame(game.externalId)
            .then(({ boxArtUrl, screenshots }) => {
              const list = [boxArtUrl, ...(screenshots ?? [])].filter(Boolean) as string[];
              if (list.length) setCarouselImages(list);
            })
            .catch(() => {});
        }
      }
    }
  }, [game]);

  const searchArt = async () => {
    if (!artQuery.trim()) return;
    setArtLoading(true);
    setArtError(null);
    setArtResults(null);
    try {
      const list = await metadataApi.search(artQuery.trim());
      setArtResults(list);
    } catch (e) {
      setArtError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setArtLoading(false);
    }
  };

  const applyArt = async (result: MetadataSearchResult) => {
    if (!game) return;
    setApplyingArt(true);
    setArtError(null);
    try {
      let boxArtUrl = result.coverUrl ?? null;
      let screenshots: string[] = [];
      try {
        const details = await metadataApi.getGame(result.id);
        boxArtUrl = details.boxArtUrl ?? result.coverUrl ?? null;
        screenshots = details.screenshots ?? [];
      } catch {
        // use result.coverUrl only
      }
      const newImages = [boxArtUrl, ...screenshots].filter(Boolean) as string[];
      const updated = await gamesApi.update(game.id, {
        coverUrl: result.coverUrl ?? game.coverUrl,
        boxArtUrl: boxArtUrl ?? result.coverUrl ?? game.boxArtUrl,
        externalId: String(result.id),
        screenshots: newImages.length > 0 ? JSON.stringify(newImages) : null,
        ...(result.summary != null && { description: result.summary }),
        ...(result.releaseDate != null && { releaseDate: result.releaseDate }),
      });
      if (newImages.length) setCarouselImages(newImages);
      setCarouselIndex(0);
      onUpdate(updated);
    } catch (e) {
      setArtError(e instanceof Error ? e.message : 'Failed to apply art');
    } finally {
      setApplyingArt(false);
    }
  };

  const handleRefreshArt = async () => {
    if (!game) return;
    setRefreshArtLoading(true);
    setRefreshArtError(null);
    try {
      const updated = await gamesApi.refreshArt(game.id);
      const stored = parseScreenshots(updated.screenshots);
      if (stored.length > 0) setCarouselImages(stored);
      else if (updated.boxArtUrl) setCarouselImages([updated.boxArtUrl]);
      setCarouselIndex(0);
      onUpdate(updated);
    } catch (e) {
      setRefreshArtError(e instanceof Error ? e.message : 'Failed to refresh art');
    } finally {
      setRefreshArtLoading(false);
    }
  };

  const handleSteamStoreArt = async () => {
    if (!game) return;
    const appId = parseInt(steamAppIdInput.trim(), 10);
    if (isNaN(appId) || appId <= 0) {
      setSteamStoreArtError('Enter a valid Steam App ID (e.g. from store.steampowered.com/app/12345)');
      return;
    }
    setSteamStoreArtLoading(true);
    setSteamStoreArtError(null);
    try {
      const art = await steamApi.getStoreArt(appId);
      const screenshotsJson =
        art.screenshots.length > 0 ? JSON.stringify(art.screenshots) : null;
      const updated = await gamesApi.update(game.id, {
        coverUrl: art.coverUrl,
        boxArtUrl: art.boxArtUrl,
        spineCoverUrl: art.spineCoverUrl,
        screenshots: screenshotsJson,
        ...(art.description != null && { description: art.description }),
        ...(art.developer != null && { developer: art.developer }),
        ...(art.publisher != null && { publisher: art.publisher }),
        ...(art.releaseDate != null && { releaseDate: art.releaseDate }),
        ...(art.genres != null && { genres: art.genres }),
        ...(art.storeUrl != null && { storeUrl: art.storeUrl }),
      });
      const images =
        art.screenshots.length > 0 ? art.screenshots : [art.boxArtUrl, art.coverUrl].filter(Boolean);
      setCarouselImages(images);
      setCarouselIndex(0);
      setForm((f) => ({
        ...f,
        description: updated.description ?? f.description,
        developer: updated.developer ?? f.developer,
        publisher: updated.publisher ?? f.publisher,
        releaseDate: updated.releaseDate ?? f.releaseDate,
        genres: updated.genres ?? f.genres,
        storeUrl: updated.storeUrl ?? f.storeUrl,
      }));
      onUpdate(updated);
    } catch (e) {
      setSteamStoreArtError(e instanceof Error ? e.message : 'Steam store art not found for this App ID');
    } finally {
      setSteamStoreArtLoading(false);
    }
  };

  useEffect(() => {
    if (carouselImages.length <= 1) return;
    const id = setInterval(() => {
      setCarouselIndex((i) => (i + 1) % carouselImages.length);
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [carouselImages.length]);

  const handleSave = async () => {
    if (!game) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await gamesApi.update(game.id, form);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!game) return null;

  const completedAtStr = form.completedAt ?? '';
  const ratingOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCarouselIndex((i) => (i - 1 + carouselImages.length) % carouselImages.length);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCarouselIndex((i) => (i + 1) % carouselImages.length);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="detail-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="detail-layout">
          <div className="detail-layout-stage">
          {/* Box slides over from shelf and grows from spine size to full hover size */}
          <motion.div
            className="detail-floating-spine detail-floating-box-art"
            initial={{
              opacity: 0,
              width: 72,
              height: 180,
              x: -360,
              rotateY: -82,
              rotateX: 0,
            }}
            animate={{
              opacity: 1,
              width: 640,
              height: 360, /* 16:9 */
              x: 0,
              rotateY: 22,
              rotateX: -4,
            }}
            exit={{
              opacity: 0,
              width: 72,
              height: 180,
              x: -280,
              rotateY: 70,
            }}
            transition={{ type: 'spring', damping: 24, stiffness: 140 }}
            style={{ transformStyle: 'preserve-3d', transformOrigin: 'left center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="floating-spine-levitate">
            <div className="floating-spine-inner floating-box-art-inner">
              <div className="floating-spine-cover floating-carousel">
                {carouselImages.length > 0 ? (
                  <>
                    <div
                      className="floating-carousel-viewport"
                      style={{ '--carousel-count': carouselImages.length } as React.CSSProperties}
                    >
                      <motion.div
                        className="floating-carousel-track"
                        animate={{
                          x: carouselImages.length > 1 ? `-${carouselIndex * (100 / carouselImages.length)}%` : 0,
                        }}
                        transition={{ type: 'spring', damping: 28, stiffness: 200 }}
                      >
                        {carouselImages.map((url, i) => (
                          <div key={i} className="floating-carousel-slide">
                            <img
                              src={url}
                              alt=""
                              className="floating-box-art-img"
                              draggable={false}
                            />
                          </div>
                        ))}
                      </motion.div>
                    </div>
                    {carouselImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="floating-carousel-arrow floating-carousel-arrow-left"
                          onClick={goPrev}
                          aria-label="Previous image"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="floating-carousel-arrow floating-carousel-arrow-right"
                          onClick={goNext}
                          aria-label="Next image"
                        >
                          ›
                        </button>
                        <div className="floating-carousel-dots" aria-hidden>
                          {carouselImages.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              className={`floating-carousel-dot ${i === carouselIndex ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCarouselIndex(i);
                              }}
                              aria-label={`Slide ${i + 1}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="spine-placeholder">
                    <span>{game.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="floating-spine-title">{game.name}</div>
            </div>
            </div>
          </motion.div>
          </div>

          <motion.div
            className="detail-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
              ×
            </button>
            <div className="detail-content">
              <div className="detail-header">
              {game.coverUrl ? (
                <img src={game.coverUrl} alt="" className="detail-cover" />
              ) : (
                <div className="detail-cover placeholder">No cover</div>
              )}
              <div className="detail-meta">
                <h2>{game.name}</h2>
                <p className="detail-platform">
                  {game.platform} · {game.source}
                </p>
                {game.releaseDate && (
                  <p className="detail-release">Released: {game.releaseDate}</p>
                )}
                {(game.developer || game.publisher) && (
                  <p className="detail-developer-publisher">
                    {[game.developer, game.publisher].filter(Boolean).join(' · ')}
                  </p>
                )}
                {game.storeUrl && (
                  <a href={game.storeUrl} target="_blank" rel="noopener noreferrer" className="detail-store-link">
                    View on store
                  </a>
                )}
                {game.trailerUrl && (
                  <a href={game.trailerUrl} target="_blank" rel="noopener noreferrer" className="detail-store-link">
                    Watch trailer
                  </a>
                )}
              </div>
            </div>
            <section className="detail-section">
              <h3>Details</h3>
              <div className="detail-form">
                <label>
                  Store URL
                  <input
                    type="url"
                    placeholder="https://…"
                    value={form.storeUrl ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, storeUrl: e.target.value || null }))}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    placeholder="About this game…"
                    value={form.description ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
                    rows={3}
                  />
                </label>
                <label>
                  Genres
                  <input
                    type="text"
                    placeholder="Action, RPG, …"
                    value={form.genres ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, genres: e.target.value || null }))}
                  />
                </label>
                <label>
                  Developer
                  <input
                    type="text"
                    placeholder="Studio name"
                    value={form.developer ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, developer: e.target.value || null }))}
                  />
                </label>
                <label>
                  Publisher
                  <input
                    type="text"
                    placeholder="Publisher name"
                    value={form.publisher ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value || null }))}
                  />
                </label>
                <label>
                  Trailer / video URL
                  <input
                    type="url"
                    placeholder="https://…"
                    value={form.trailerUrl ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, trailerUrl: e.target.value || null }))}
                  />
                </label>
                <label>
                  Tags
                  <input
                    type="text"
                    placeholder="Comma-separated tags"
                    value={form.tags ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value || null }))}
                  />
                </label>
              </div>
            </section>
            <section className="detail-section">
              <h3>Cover art</h3>
              <p className="detail-art-search-hint">
                {game.source === 'steam' && game.externalId
                  ? 'Steam games use official store art by default. Refresh to fetch latest screenshots and capsule art.'
                  : 'Update this game\'s cover art from IGDB (Twitch API), or RAWG if configured as fallback.'}
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={handleRefreshArt}
                disabled={refreshArtLoading}
              >
                {refreshArtLoading
                  ? 'Refreshing…'
                  : game.source === 'steam' && game.externalId
                    ? 'Refresh from Steam store'
                    : 'Refresh art from IGDB'}
              </button>
              {refreshArtError && <p className="detail-art-search-error">{refreshArtError}</p>}
              <div className="detail-steam-store-art" style={{ marginTop: '1rem' }}>
                <h4 style={{ marginBottom: '0.5rem', fontSize: '0.95rem' }}>Try Steam store art</h4>
                <p className="detail-art-search-hint">
                  For cross-platform games (or any game on Steam), enter the Steam App ID to pull official store art and screenshots. Find the ID in the store URL: store.steampowered.com/app/<strong>12345</strong>
                </p>
                <div className="detail-art-search-form" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Steam App ID (e.g. 12345)"
                    value={steamAppIdInput}
                    onChange={(e) => setSteamAppIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSteamStoreArt()}
                    className="detail-art-search-input"
                    aria-label="Steam App ID"
                    style={{ maxWidth: '12rem' }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSteamStoreArt}
                    disabled={steamStoreArtLoading || !steamAppIdInput.trim()}
                  >
                    {steamStoreArtLoading ? 'Fetching…' : 'Fetch from Steam store'}
                  </button>
                </div>
                {steamStoreArtError && (
                  <p className="detail-art-search-error" style={{ marginTop: '0.5rem' }}>
                    {steamStoreArtError}
                  </p>
                )}
              </div>
            </section>
            <section className="detail-section detail-art-search">
              <h3>Search for art</h3>
              <p className="detail-art-search-hint">Search to find cover art and apply it to this game.</p>
              <div className="detail-art-search-form">
                <input
                  type="text"
                  placeholder="Game name…"
                  value={artQuery}
                  onChange={(e) => setArtQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchArt()}
                  className="detail-art-search-input"
                  aria-label="Search for game art"
                />
                <button
                  type="button"
                  className="btn-primary detail-art-search-btn"
                  onClick={searchArt}
                  disabled={artLoading || !artQuery.trim()}
                >
                  {artLoading ? 'Searching…' : 'Search'}
                </button>
              </div>
              {artError && <p className="detail-art-search-error">{artError}</p>}
              {artResults !== null && (
                <div className="detail-art-results">
                  {artResults.length === 0 ? (
                    <p className="detail-art-results-empty">No results. Try another search.</p>
                  ) : (
                    <div className="detail-art-results-grid" role="list">
                      {artResults.map((r) => (
                        <button
                          key={String(r.id)}
                          type="button"
                          className="detail-art-result-item"
                          onClick={() => applyArt(r)}
                          disabled={applyingArt}
                          title={r.name}
                          role="listitem"
                        >
                          {r.coverUrl ? (
                            <img src={r.coverUrl} alt="" className="detail-art-result-img" />
                          ) : (
                            <div className="detail-art-result-placeholder">{r.name.slice(0, 2).toUpperCase()}</div>
                          )}
                          <span className="detail-art-result-name">{r.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
            <section className="detail-section">
              <h3>Your progress</h3>
              {error && <p className="detail-error">{error}</p>}
              <div className="detail-form">
                <label>
                  Completion date
                  <input
                    type="date"
                    value={completedAtStr}
                    onChange={(e) => setForm((f) => ({ ...f, completedAt: e.target.value || null }))}
                  />
                </label>
                <label>
                  Playtime (minutes)
                  <input
                    type="number"
                    min={0}
                    value={form.playtimeMinutes ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        playtimeMinutes: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                  />
                </label>
                <label>
                  Rating (1–10)
                  <select
                    value={form.rating ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        rating: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                  >
                    <option value="">—</option>
                    {ratingOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Notes
                  <textarea
                    value={form.notes ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
                    rows={4}
                  />
                </label>
                <button type="button" className="detail-save" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="detail-delete"
                  onClick={async () => {
                    if (!game) return;
                    if (!window.confirm(`Remove "${game.name}" from your library?`)) return;
                    setDeleting(true);
                    try {
                      await gamesApi.delete(game.id);
                      onDelete(game);
                      onClose();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to delete');
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting}
                >
                  {deleting ? 'Removing…' : 'Remove from library'}
                </button>
              </div>
            </section>
          </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
