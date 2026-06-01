import './ActiveOutboundCallPanel.css';
import { formatAuNumber } from '../utils/formatAuNumber';
import { formatCallDuration } from '../utils/formatCallDuration';

export type OutboundCallPhase = 'idle' | 'connecting' | 'active' | 'on-hold';

type ActiveOutboundCallPanelProps = {
  phase: OutboundCallPhase;
  dialNumber: string;
  callDurationSeconds: number;
  holdDurationSeconds: number;
  holdActionInFlight: boolean;
  onHold: () => void;
  onResume: () => void;
  onHangup: () => void;
};

export function ActiveOutboundCallPanel({
  phase,
  dialNumber,
  callDurationSeconds,
  holdDurationSeconds,
  holdActionInFlight,
  onHold,
  onResume,
  onHangup,
}: ActiveOutboundCallPanelProps) {
  if (phase === 'idle') {
    return null;
  }

  const formatted = formatAuNumber(dialNumber);
  const canHold = phase === 'active';
  const isOnHold = phase === 'on-hold';

  return (
    <section className="card card-outbound-active" aria-live="polite">
      <h2>Active call</h2>
      <p className="outbound-active-number">{formatted}</p>

      {phase === 'connecting' && (
        <p className="outbound-active-status outbound-active-status--connecting">Connecting…</p>
      )}

      {phase === 'active' && (
        <p className="outbound-active-status">
          Ongoing call · <span className="outbound-active-timer">{formatCallDuration(callDurationSeconds)}</span>
        </p>
      )}

      {isOnHold && (
        <>
          <p className="outbound-active-status outbound-active-status--hold">Call on hold</p>
          <p className="outbound-active-hold-timer">
            On hold · <span>{formatCallDuration(holdDurationSeconds)}</span>
          </p>
          <p className="outbound-active-hold-hint">
            Caller hears hold music while you are on hold.
          </p>
        </>
      )}

      <div className="outbound-active-actions">
        {canHold && (
          <button
            type="button"
            className="btn-outbound-hold"
            onClick={onHold}
            disabled={holdActionInFlight}
          >
            {holdActionInFlight ? 'Holding…' : 'Hold'}
          </button>
        )}
        {isOnHold && (
          <button
            type="button"
            className="btn-outbound-resume"
            onClick={onResume}
            disabled={holdActionInFlight}
          >
            {holdActionInFlight ? 'Resuming…' : 'Resume'}
          </button>
        )}
        <button
          type="button"
          className="btn-outbound-hangup"
          onClick={onHangup}
          disabled={holdActionInFlight}
        >
          Hangup
        </button>
      </div>
    </section>
  );
}
