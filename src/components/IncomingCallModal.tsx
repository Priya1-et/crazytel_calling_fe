import './IncomingCallModal.css';
import { formatAuNumber } from '../utils/formatAuNumber';

type IncomingCallModalProps = {
  open: boolean;
  callerNumber: string;
  recordChoice: boolean | null;
  isActive: boolean;
  isOnHold: boolean;
  callWaitingHint: boolean;
  durationSeconds: number;
  holdDurationSeconds: number;
  actionInFlight: boolean;
  holdActionInFlight: boolean;
  onRecordYes: () => void;
  onRecordNo: () => void;
  onAccept: () => void;
  onReject: () => void;
  onHold: () => void;
  onResume: () => void;
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
  isOnHold,
  callWaitingHint,
  durationSeconds,
  holdDurationSeconds,
  actionInFlight,
  holdActionInFlight,
  onRecordYes,
  onRecordNo,
  onAccept,
  onReject,
  onHold,
  onResume,
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
            {isOnHold ? (
              <>
                <p className="incoming-call-message incoming-call-message--hold">Call on hold</p>
                <p className="incoming-call-timer incoming-call-timer--hold">
                  On hold · {formatDuration(holdDurationSeconds)}
                </p>
                <p className="incoming-call-hold-hint">Caller hears hold music while you are on hold.</p>
              </>
            ) : (
              <>
                <p className="incoming-call-message">Ongoing call</p>
                <p className="incoming-call-timer">{formatDuration(durationSeconds)}</p>
              </>
            )}
            <div className="incoming-call-actions">
              {!isOnHold ? (
                <button
                  type="button"
                  className="btn-incoming-hold"
                  onClick={onHold}
                  disabled={holdActionInFlight}
                >
                  {holdActionInFlight ? 'Holding…' : 'Hold'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-incoming-resume"
                  onClick={onResume}
                  disabled={holdActionInFlight}
                >
                  {holdActionInFlight ? 'Resuming…' : 'Resume'}
                </button>
              )}
              <button
                type="button"
                className="btn-incoming-hangup"
                onClick={onHangup}
                disabled={holdActionInFlight}
              >
                End call
              </button>
            </div>
          </>
        ) : (
          <>
            {callWaitingHint && (
              <p className="incoming-call-waiting-hint">
                Another call is active — answering will put it on hold.
              </p>
            )}
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
