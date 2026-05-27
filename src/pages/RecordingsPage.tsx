import { useCallback, useEffect, useState } from 'react';
import {
  fetchRecordings,
  recordingStreamUrl,
  type RecordingDirection,
  type RecordingListItem,
} from '../api/recordings';
import './RecordingsPage.css';

type RecordingsPageProps = {
  onBack: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function RecordingsPage({ onBack }: RecordingsPageProps) {
  const [filter, setFilter] = useState<'all' | RecordingDirection>('all');
  const [recordings, setRecordings] = useState<RecordingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchRecordings(filter === 'all' ? undefined : filter);
      setRecordings(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load recordings');
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="recordings-page">
      <header className="recordings-header">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Back to calls
        </button>
        <h1>Call recordings</h1>
      </header>

      <div className="recordings-filters">
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | RecordingDirection)}>
            <option value="all">All</option>
            <option value="outgoing">Outgoing</option>
            <option value="incoming">Incoming</option>
          </select>
        </label>
        <button type="button" className="btn-refresh" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading && <p className="recordings-muted">Loading…</p>}
      {error && <p className="recordings-error">{error}</p>}
      {!loading && !error && recordings.length === 0 && (
        <p className="recordings-muted">No recordings yet. Record a call using the prompt before dial or accept.</p>
      )}

      <ul className="recordings-list">
        {recordings.map((rec) => (
          <li key={rec.id} className="recordings-item">
            <div className="recordings-meta">
              <span className={`recordings-badge recordings-badge-${rec.direction}`}>
                {rec.direction}
              </span>
              <span className="recordings-name">{rec.filename}</span>
              <span className="recordings-sub">
                {formatWhen(rec.createdAt)} · {formatBytes(rec.sizeBytes)}
              </span>
            </div>
            <audio controls preload="none" src={recordingStreamUrl(rec.id)} className="recordings-player" />
          </li>
        ))}
      </ul>
    </main>
  );
}
