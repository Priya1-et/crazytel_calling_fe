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
  const isConnecting = phase === 'connecting';

  return (
    <section
      className={`outbound-call-card ${isConnecting ? 'outbound-call-card--connecting' : ''} ${isOnHold ? 'outbound-call-card--hold' : ''}`}
      aria-live="polite"
      aria-label="Active outbound call"
    >
      <p className="outbound-call-label">Outgoing call</p>
      <p className="outbound-call-number">{formatted}</p>

      {isConnecting && (
        <p className="outbound-call-status outbound-call-status--connecting">Connecting…</p>
      )}

      {phase === 'active' && (
        <>
          <p className="outbound-call-status">Ongoing call</p>
          <p className="outbound-call-timer">{formatCallDuration(callDurationSeconds)}</p>
        </>
      )}

      {isOnHold && (
        <>
          <p className="outbound-call-status outbound-call-status--hold">Call on hold</p>
          <p className="outbound-call-timer outbound-call-timer--hold">
            On hold · {formatCallDuration(holdDurationSeconds)}
          </p>
          <p className="outbound-call-hint">Caller hears hold music while you are on hold.</p>
        </>
      )}

      <div className="outbound-call-actions">
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
          disabled={holdActionInFlight && !isConnecting}
        >
          End call
        </button>
      </div>
    </section>
  );
}
