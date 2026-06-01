import { Session, SessionState } from 'sip.js';

function getPeerConnection(session: Session): RTCPeerConnection | undefined {
  const sdh = session.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection } | undefined;
  return sdh?.peerConnection;
}

/** Enable/disable local send/receive tracks (mute experience while on hold). */
export function setSessionMediaEnabled(session: Session, enabled: boolean): void {
  const pc = getPeerConnection(session);
  if (!pc) return;
  pc.getSenders().forEach((sender) => {
    if (sender.track) sender.track.enabled = enabled;
  });
  pc.getReceivers().forEach((receiver) => {
    if (receiver.track) receiver.track.enabled = enabled;
  });
}

/**
 * Send re-INVITE to hold or resume (RFC 6337). Asterisk should play MOH to the remote party on hold.
 */
export async function setSessionHold(session: Session, hold: boolean): Promise<void> {
  if (session.state !== SessionState.Established) {
    throw new Error('Call must be connected before hold');
  }

  const previousOpts = session.sessionDescriptionHandlerOptionsReInvite ?? {};
  session.sessionDescriptionHandlerOptionsReInvite = { ...previousOpts, hold };

  setSessionMediaEnabled(session, !hold);

  try {
    await session.invite({
      requestDelegate: {
        onReject: () => {
          session.sessionDescriptionHandlerOptionsReInvite = { ...previousOpts, hold: !hold };
          setSessionMediaEnabled(session, hold);
        },
      },
    });
  } catch (err) {
    session.sessionDescriptionHandlerOptionsReInvite = { ...previousOpts, hold: !hold };
    setSessionMediaEnabled(session, hold);
    throw err;
  }
}
