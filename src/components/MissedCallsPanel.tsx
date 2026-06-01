import './MissedCallsPanel.css';
import { formatAuNumber } from '../utils/formatAuNumber';
import type { MissedCallEntry } from '../utils/missedCallsStorage';

type MissedCallsPanelProps = {
  calls: MissedCallEntry[];
  onCallBack: (phoneNumber: string) => void;
  onDismiss: (id: string) => void;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function MissedCallsPanel({ calls, onCallBack, onDismiss }: MissedCallsPanelProps) {
  if (calls.length === 0) {
    return null;
  }

  return (
    <section className="missed-calls-panel" aria-label="Missed calls">
      <h2 className="missed-calls-title">Missed calls</h2>
      <ul className="missed-calls-list">
        {calls.map((entry) => (
          <li key={entry.id} className="missed-calls-item">
            <div className="missed-calls-info">
              <span className="missed-calls-number">{formatAuNumber(entry.phoneNumber)}</span>
              <span className="missed-calls-time">{formatWhen(entry.at)}</span>
            </div>
            <div className="missed-calls-actions">
              <button type="button" className="btn-missed-callback" onClick={() => onCallBack(entry.phoneNumber)}>
                Call back
              </button>
              <button type="button" className="btn-missed-dismiss" onClick={() => onDismiss(entry.id)}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
