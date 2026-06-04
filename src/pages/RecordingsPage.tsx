import { useCallback, useEffect, useState } from 'react';
import {
  fetchRecordings,
  recordingStreamUrl,
  type RecordingDirection,
  type RecordingListItem,
} from '../api/recordings';
import { formatAuNumber } from '../utils/formatAuNumber';
import './RecordingsPage.css';

type RecordingsPageProps = {
  onBack: () => void;
};

type FilterValue = 'all' | RecordingDirection;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatDuration(seconds?: number): string | null {
  if (seconds === undefined || seconds < 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Try to show a friendly number from Asterisk filename (YYYYMMDD-HHMMSS-number-unique.wav). */
function displayTitle(filename: string): string {
  const base = filename.replace(/\.wav$/i, '');
  const parts = base.split('-');
  if (parts.length >= 3) {
    const maybeNumber = parts.slice(2, -1).join('-').replace(/^-+|-+$/g, '');
    if (maybeNumber && /\d/.test(maybeNumber)) {
      const digits = maybeNumber.replace(/\D/g, '');
      if (digits.length >= 8) {
        return formatAuNumber(digits) || maybeNumber;
      }
    }
  }
  return base;
}

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'outgoing', label: 'Outgoing' },
  { value: 'incoming', label: 'Incoming' },
];

export function RecordingsPage({ onBack }: RecordingsPageProps) {
  const [filter, setFilter] = useState<FilterValue>('all');
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
        <button type="button" className="recordings-btn-back" onClick={onBack}>
          ← Back to console
        </button>
        <h1 className="recordings-title">Call recordings</h1>
        <p className="recordings-subtitle">Listen to saved incoming and outgoing calls</p>
      </header>

      <div className="recordings-toolbar">
        <div className="recordings-filters" role="tablist" aria-label="Filter recordings">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              className={`recordings-filter-pill ${filter === f.value ? 'recordings-filter-pill--active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="recordings-btn-refresh" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {loading && (
        <div className="recordings-state recordings-state--loading">
          <span className="recordings-spinner" aria-hidden />
          Loading recordings…
        </div>
      )}
      {error && (
        <div className="recordings-state recordings-state--error" role="alert">
          {error}
        </div>
      )}
      {!loading && !error && recordings.length === 0 && (
        <div className="recordings-state recordings-state--empty">
          <p>No recordings yet</p>
          <span>Calls are saved automatically when answered.</span>
        </div>
      )}

      {!loading && !error && recordings.length > 0 && (
        <ul className="recordings-list">
          {recordings.map((rec) => {
            const durationLabel = formatDuration(rec.durationSeconds);
            const title = displayTitle(rec.filename);
            return (
              <li key={rec.id} className="recordings-card">
                <div className="recordings-card-head">
                  <span
                    className={`recordings-badge recordings-badge--${rec.direction}`}
                  >
                    {rec.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                  </span>
                  {durationLabel && (
                    <span className="recordings-duration">{durationLabel}</span>
                  )}
                </div>
                <p className="recordings-card-title">{title}</p>
                <p className="recordings-card-meta">
                  {formatWhen(rec.createdAt)} · {formatBytes(rec.sizeBytes)}
                </p>
                <audio
                  controls
                  preload="metadata"
                  src={recordingStreamUrl(rec.id)}
                  className="recordings-player"
                />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
