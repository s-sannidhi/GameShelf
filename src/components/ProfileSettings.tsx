import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authApi, steamApi, playstationApi, syncApi, setAuthToken } from '../api';

const NPSSO_URL = 'https://ca.account.sony.com/api/v1/ssocookie';
const SIGNIN_URL = 'https://www.playstation.com/';

interface ProfileSettingsProps {
  onSynced: () => void;
}

export function ProfileSettings({ onSynced }: ProfileSettingsProps) {
  const { user, refreshUser, logout } = useAuth();
  const [steamInput, setSteamInput] = useState('');
  const [steamSaving, setSteamSaving] = useState(false);
  const [steamSyncLoading, setSteamSyncLoading] = useState(false);
  const [steamError, setSteamError] = useState<string | null>(null);
  const [steamSuccess, setSteamSuccess] = useState(false);
  const [psnInput, setPsnInput] = useState('');
  const [psnLinkLoading, setPsnLinkLoading] = useState(false);
  const [psnSyncLoading, setPsnSyncLoading] = useState(false);
  const [psnError, setPsnError] = useState<string | null>(null);
  const [psnSuccess, setPsnSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSaveSteam = async () => {
    const raw = steamInput.trim();
    if (!raw) {
      setSteamError('Enter your Steam profile link or 64-bit ID.');
      return;
    }
    setSteamSaving(true);
    setSteamError(null);
    setSteamSuccess(false);
    try {
      await authApi.updateProfile({ steamId: raw });
      await refreshUser();
      setSteamSuccess(true);
      setSteamInput('');
    } catch (e) {
      setSteamError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSteamSaving(false);
    }
  };

  const handleSteamSyncNow = async () => {
    setSteamSyncLoading(true);
    setSteamError(null);
    try {
      await steamApi.sync();
      onSynced();
    } catch (e) {
      setSteamError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSteamSyncLoading(false);
    }
  };

  const handleLinkPsn = async () => {
    const token = psnInput.trim();
    if (!token) {
      setPsnError('Paste your NPSSO token.');
      return;
    }
    setPsnLinkLoading(true);
    setPsnError(null);
    setPsnSuccess(false);
    try {
      await playstationApi.sync(token, true);
      await refreshUser();
      setPsnSuccess(true);
      setPsnInput('');
      onSynced();
    } catch (e) {
      setPsnError(e instanceof Error ? e.message : 'Link failed');
    } finally {
      setPsnLinkLoading(false);
    }
  };

  const handlePsnSyncNow = async () => {
    setPsnSyncLoading(true);
    setPsnError(null);
    try {
      await syncApi.auto();
      onSynced();
    } catch (e) {
      setPsnError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setPsnSyncLoading(false);
    }
  };

  return (
    <div className="profile-settings">
      <h2 className="profile-settings-title">Profile &amp; sync</h2>
      <p className="profile-settings-intro">
        Save your Steam and PlayStation accounts here to enable auto-sync when you open the app. You can still use the Sync buttons in the Library for one-off syncs.
      </p>

      <section className="profile-section">
        <h3 className="profile-section-title">Steam</h3>
        <p className="profile-section-status">
          {user?.steamId ? (
            <>Linked (ID saved). Auto-sync will use this account.</>
          ) : (
            <>Not linked. Add your Steam profile below.</>
          )}
        </p>
        <p className="profile-section-hint">
          Paste your{' '}
          <a href="https://steamcommunity.com/" target="_blank" rel="noopener noreferrer" className="profile-link">
            Steam profile link
          </a>
          {' '}(e.g. steamcommunity.com/id/YourName) or your 64-bit ID. We resolve it via Steam’s API.
        </p>
        <div className="profile-section-actions">
          <input
            type="text"
            placeholder="Profile link or 64-bit ID"
            value={steamInput}
            onChange={(e) => setSteamInput(e.target.value)}
            className="profile-input"
            aria-label="Steam profile URL or ID"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={handleSaveSteam}
            disabled={steamSaving || !steamInput.trim()}
          >
            {steamSaving ? 'Saving…' : 'Save'}
          </button>
          {user?.steamId && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleSteamSyncNow}
              disabled={steamSyncLoading}
            >
              {steamSyncLoading ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
        {steamError && <p className="profile-error">{steamError}</p>}
        {steamSuccess && <p className="profile-success">Steam account saved.</p>}
      </section>

      <section className="profile-section">
        <h3 className="profile-section-title">PlayStation</h3>
        <p className="profile-section-status">
          {user?.psnLinked ? (
            <>Linked. Auto-sync will use your PSN account.</>
          ) : (
            <>Not linked. Get your NPSSO token and paste it below.</>
          )}
        </p>
        <p className="profile-section-hint">
          Log in at{' '}
          <a href={SIGNIN_URL} target="_blank" rel="noopener noreferrer" className="profile-link">
            playstation.com
          </a>
          , then open your{' '}
          <a href={NPSSO_URL} target="_blank" rel="noopener noreferrer" className="profile-link">
            NPSSO token
          </a>
          {' '}in the same browser—copy the <code>npsso</code> value from the JSON and paste it below.
        </p>
        <div className="profile-section-actions">
          <input
            type="text"
            placeholder="NPSSO token (64 characters)"
            value={psnInput}
            onChange={(e) => setPsnInput(e.target.value)}
            className="profile-input"
            aria-label="NPSSO token"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={handleLinkPsn}
            disabled={psnLinkLoading || !psnInput.trim()}
          >
            {psnLinkLoading ? 'Linking…' : 'Link account'}
          </button>
          {user?.psnLinked && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handlePsnSyncNow}
              disabled={psnSyncLoading}
            >
              {psnSyncLoading ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>
        {psnError && <p className="profile-error">{psnError}</p>}
        {psnSuccess && <p className="profile-success">PlayStation account linked.</p>}
      </section>

      <section className="profile-section profile-section-danger">
        <h3 className="profile-section-title">Delete account</h3>
        <p className="profile-section-hint">
          Permanently delete your account and all your games, friends, and data. This cannot be undone.
        </p>
        <div className="profile-section-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Type DELETE to confirm"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="profile-input"
            aria-label="Type DELETE to confirm account deletion"
            style={{ maxWidth: '16rem' }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              if (deleteConfirm.trim() !== 'DELETE') {
                setDeleteError('Type DELETE to confirm.');
                return;
              }
              setDeleteLoading(true);
              setDeleteError(null);
              try {
                await authApi.deleteAccount();
                setAuthToken(null);
                await logout();
              } catch (e) {
                setDeleteError(e instanceof Error ? e.message : 'Failed to delete account');
              } finally {
                setDeleteLoading(false);
              }
            }}
            disabled={deleteLoading || deleteConfirm.trim() !== 'DELETE'}
          >
            {deleteLoading ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
        {deleteError && <p className="profile-error">{deleteError}</p>}
      </section>
    </div>
  );
}
