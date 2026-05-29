import './IncomingCallModal.css';
import { formatAuNumber } from '../utils/formatAuNumber';

type IncomingCallModalProps = {
  open: boolean;
  callerNumber: string;
  recordChoice: boolean | null;
  isActive: boolean;
  durationSeconds: number;
  actionInFlight: boolean;
  onRecordYes: () => void;
  onRecordNo: () => void;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
};

function formatDuration(totalSeconds: number) {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function IncomingCallModal({
  open,
  callerNumber,
  recordChoice,
  isActive,
  durationSeconds,
  actionInFlight,
  onRecordYes,
  onRecordNo,
  onAccept,
  onReject,
  onHangup,
}: IncomingCallModalProps) {
  if (!open) {
    return null;
  }

  const formattedCaller = formatAuNumber(callerNumber);

  return (
    <div className="incoming-call-backdrop" role="presentation">
      <div
        className="incoming-call-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-call-title"
      >
        <p className="incoming-call-label">Incoming call</p>
        <h2 id="incoming-call-title" className="incoming-call-caller">
          {formattedCaller}
        </h2>

        {isActive ? (
          <>
            <p className="incoming-call-message">Ongoing call</p>
            <p className="incoming-call-timer">{formatDuration(durationSeconds)}</p>
            <div className="incoming-call-actions">
              <button type="button" className="btn-incoming-hangup" onClick={onHangup}>
                End call
              </button>
            </div>
          </>
        ) : (
          <>
            {recordChoice === null ? (
              <>
                <p className="incoming-call-message">
                  Record this call? Choose before accepting, or reject the call.
                </p>
                <div className="incoming-call-record-actions">
                  <button type="button" className="btn-incoming-record-yes" onClick={onRecordYes}>
                    Yes, record
                  </button>
                  <button type="button" className="btn-incoming-record-no" onClick={onRecordNo}>
                    No recording
                  </button>
                </div>
              </>
            ) : (
              <p className="incoming-call-message">
                Recording: {recordChoice ? 'Yes' : 'No'} — tap Accept to answer.
              </p>
            )}

            <div className="incoming-call-actions">
              <button
                type="button"
                className="btn-incoming-accept"
                onClick={onAccept}
                disabled={recordChoice === null || actionInFlight}
              >
                {actionInFlight ? 'Accepting…' : 'Accept'}
              </button>
              <button type="button" className="btn-incoming-reject" onClick={onReject} disabled={actionInFlight}>
                Reject
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
