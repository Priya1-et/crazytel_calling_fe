import { useEffect, useRef, useState } from 'react';
import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  UserAgent,
  URI,
} from 'sip.js';
import type { AsteriskEventType } from './config/constants';
import {
  API_PATHS,
  DIAL_PLACEHOLDER,
  LOG_PREFIX,
  UI_TITLE,
} from './config/constants';
import { appConfig, buildIceServer, outgoingNumbers } from './config/env';
import { formatAuNumber } from './utils/formatAuNumber';
import { normalizeDialInput } from './utils/normalizeDialInput';
import { buildInboundAcceptHeaders, buildOutboundInviteHeaders } from './utils/sipHeaders';
import {
  playOutboundTerminalSound,
  playRingback,
  stopAllCallSounds,
  stopRingback,
} from './utils/callSounds';
import { IncomingCallModal } from './components/IncomingCallModal';
import { RecordCallModal } from './components/RecordCallModal';
import { RecordingsPage } from './pages/RecordingsPage';
import './App.css';

function App() {
  const [outgoingNumber, setOutgoingNumber] = useState(outgoingNumbers[0]);
  const [dialNumber, setDialNumber] = useState('');
  const [incomingNumber, setIncomingNumber] = useState('');
  const [status, setStatus] = useState('Connecting...');
  const [isRegistered, setIsRegistered] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string>();
  const [isOutgoingMenuOpen, setIsOutgoingMenuOpen] = useState(false);
  const [micStatus, setMicStatus] = useState<'unknown' | 'ok' | 'fail'>('unknown');
  const [micDeviceLabel, setMicDeviceLabel] = useState<string>('');
  const [appView, setAppView] = useState<'call' | 'recordings'>('call');
  const [showOutboundRecordModal, setShowOutboundRecordModal] = useState(false);
  const [inboundRecordChoice, setInboundRecordChoice] = useState<boolean | null>(null);
  const [inboundSessionActive, setInboundSessionActive] = useState(false);
  const [inboundEstablishedAtMs, setInboundEstablishedAtMs] = useState<number | null>(null);
  const [inboundDurationSeconds, setInboundDurationSeconds] = useState(0);
  const [inboundActionInFlight, setInboundActionInFlight] = useState(false);

  const userAgentRef = useRef<UserAgent | undefined>(undefined);
  const registererRef = useRef<Registerer | undefined>(undefined);
  const activeSessionRef = useRef<Session | undefined>(undefined);
  const inboundInviteRef = useRef<Invitation | undefined>(undefined);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const registeredRef = useRef(false);
  const outgoingMenuRef = useRef<HTMLDivElement>(null);
  const pendingOutboundDialRef = useRef<string | null>(null);
  /** Avoid playing disconnect tone if onReject/already played a mapped tone */
  const outboundTerminalTonePlayedRef = useRef(false);
  const inboundActionInFlightRef = useRef(false);
  const inboundAcceptAttemptedRef = useRef(false);

  const consultant = appConfig.sipUsername;

  const log = (step: string, data?: unknown) => {
    if (data !== undefined) {
      console.log(`${LOG_PREFIX} [${step}]`, data);
    } else {
      console.log(`${LOG_PREFIX} [${step}]`);
    }
  };

  const logError = (step: string, data?: unknown) => {
    if (data !== undefined) {
      console.error(`${LOG_PREFIX} [${step}] ❌`, data);
    } else {
      console.error(`${LOG_PREFIX} [${step}] ❌`);
    }
  };

  const testMicrophone = async (): Promise<{ ok: boolean; label?: string; error?: string }> => {
    log('MIC.test.start');
    if (!navigator.mediaDevices?.getUserMedia) {
      logError('MIC.test.unsupported', 'navigator.mediaDevices.getUserMedia not available');
      return { ok: false, error: 'getUserMedia not supported' };
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      log('MIC.test.devices', {
        total: devices.length,
        audioInputs: audioInputs.length,
        labels: audioInputs.map((d) => d.label || '(label hidden until permission granted)'),
      });
      if (audioInputs.length === 0) {
        logError('MIC.test.no-devices', 'No audio input devices enumerated');
        return { ok: false, error: 'No audio input device found' };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      const label = track?.label ?? 'unknown';
      log('MIC.test.success', { label, settings: track?.getSettings() });
      stream.getTracks().forEach((t) => t.stop());
      return { ok: true, label };
    } catch (err) {
      const e = err as DOMException;
      logError('MIC.test.failed', { name: e.name, message: e.message });
      return { ok: false, error: `${e.name}: ${e.message}` };
    }
  };

  const bindMedia = (session: Session) => {
    const handler = session.sessionDescriptionHandler as {
      peerConnection?: RTCPeerConnection;
    };
    const pc = handler?.peerConnection;
    const audio = remoteAudioRef.current;
    if (!pc || !audio) return;

    const stream = new MediaStream();
    pc.getReceivers().forEach((r) => {
      if (r.track) stream.addTrack(r.track);
    });
    audio.srcObject = stream;
    audio.play().catch(() => null);
  };

  const pushEvent = async (eventType: AsteriskEventType, payload: Record<string, unknown>) => {
    const url = `${appConfig.apiBaseUrl}${API_PATHS.ASTERISK_EVENTS}`;
    log('API.event.send', { url, eventType, payload });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, ...payload }),
      });
      log('API.event.response', {
        url,
        status: res.status,
        ok: res.ok,
        statusText: res.statusText,
      });
    } catch (err) {
      logError('API.event.error', {
        url,
        eventType,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const attachSessionEvents = (session: Session, callId: string, phoneNumber: string) => {
    session.stateChange.addListener((state) => {
      log('SIP.session.state', {
        callId,
        phoneNumber,
        outgoingNumber,
        state: SessionState[state],
      });
      if (state === SessionState.Establishing) {
        setStatus('Ringing...');
        playRingback();
      }
      if (state === SessionState.Established) {
        stopRingback();
        setStatus('Call active');
        log('SIP.session.established', { callId });
        void pushEvent('oncall', {
          callId,
          consultant,
          phoneNumber,
          outgoingNumber,
          direction: 'outbound',
          status: 'answered',
        });
        bindMedia(session);
      }
      if (state === SessionState.Terminated) {
        stopRingback();
        if (!outboundTerminalTonePlayedRef.current) {
          playOutboundTerminalSound();
        }
        outboundTerminalTonePlayedRef.current = false;
        setStatus('Call ended');
        log('SIP.session.terminated', { callId });
        void pushEvent('disconnected', {
          callId,
          consultant,
          phoneNumber,
          status: 'disconnected',
        });
        activeSessionRef.current = undefined;
        setActiveCallId(undefined);
      }
    });
  };

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    const register = async () => {
      log('BOOT.config', {
        apiBaseUrl: appConfig.apiBaseUrl,
        sipWebsocket: appConfig.sipWebsocket,
        sipDomain: appConfig.sipDomain,
        sipUsername: appConfig.sipUsername,
        turnUrl: appConfig.turnUrl,
      });

      const uri = UserAgent.makeURI(`sip:${consultant}@${appConfig.sipDomain}`);
      if (!uri) {
        logError('BOOT.uri.invalid', {
          consultant,
          sipDomain: appConfig.sipDomain,
        });
        setStatus('Invalid SIP configuration');
        return;
      }
      log('BOOT.uri.built', { uri: uri.toString() });

      try {
        const ua = new UserAgent({
          uri,
          authorizationUsername: consultant,
          authorizationPassword: appConfig.sipPassword,
          transportOptions: { server: appConfig.sipWebsocket },
          sessionDescriptionHandlerFactoryOptions: {
            peerConnectionConfiguration: {
              iceServers: [buildIceServer()],
            },
          },
          delegate: {
            onConnect: () => {
              log('SIP.ws.connected', { server: appConfig.sipWebsocket });
              setStatus('Socket connected');
            },
            onDisconnect: (error) => {
              logError('SIP.ws.disconnected', {
                server: appConfig.sipWebsocket,
                error: error instanceof Error ? error.message : String(error ?? ''),
              });
              setIsRegistered(false);
              setStatus('Socket disconnected');
            },
            onInvite: handleIncomingCall,
          },
        });
        log('SIP.userAgent.created');

        const reg = new Registerer(ua);
        reg.stateChange.addListener((state) => {
          log('SIP.registerer.state', { state: RegistererState[state] });
          if (state === RegistererState.Registered) {
            setIsRegistered(true);
            setStatus(`Socket connected, registered ${consultant}`);
          }
          if (state === RegistererState.Unregistered) {
            setIsRegistered(false);
            setStatus('Socket connected, registration failed');
          }
        });
        log('SIP.userAgent.starting');
        await ua.start();
        log('SIP.userAgent.started');
        setStatus('Socket connected, registering...');
        await reg.register();
        log('SIP.register.success', { consultant });

        userAgentRef.current = ua;
        registererRef.current = reg;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        logError('SIP.register.failed', {
          consultant,
          sipWebsocket: appConfig.sipWebsocket,
          message: msg,
        });
        setStatus(`Offline: ${msg}`);
        setIsRegistered(false);
      }
    };

    register();

    return () => {
      stopAllCallSounds();
      registererRef.current?.unregister().catch(() => null);
      userAgentRef.current?.stop().catch(() => null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!outgoingMenuRef.current?.contains(event.target as Node)) {
        setIsOutgoingMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    log('BOOT.mic.preflight');
    void testMicrophone().then((result) => {
      setMicStatus(result.ok ? 'ok' : 'fail');
      if (result.ok && result.label) setMicDeviceLabel(result.label);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearInboundUi = () => {
    inboundInviteRef.current = undefined;
    setIncomingNumber('');
    setInboundRecordChoice(null);
    setInboundSessionActive(false);
    setInboundEstablishedAtMs(null);
    setInboundDurationSeconds(0);
    setInboundActionInFlight(false);
    setActiveCallId(undefined);
    inboundAcceptAttemptedRef.current = false;
  };

  const dismissInboundInvitation = async (invitation: Invitation) => {
    try {
      if (invitation.state === SessionState.Established) {
        await invitation.bye();
      } else if (
        invitation.state === SessionState.Initial ||
        invitation.state === SessionState.Establishing
      ) {
        await invitation.reject();
      }
    } catch (err) {
      logError('INBOUND.dismiss.failed', {
        state: SessionState[invitation.state],
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      clearInboundUi();
      setStatus('Ready');
    }
  };

  function handleIncomingCall(invitation: Invitation) {
    inboundInviteRef.current = invitation;
    const caller = invitation.remoteIdentity.uri.user ?? 'unknown';
    log('INBOUND.invite.received', { caller, consultant });
    setIncomingNumber(caller);
    setInboundRecordChoice(null);
    setInboundSessionActive(false);
    setInboundEstablishedAtMs(null);
    setInboundDurationSeconds(0);
    inboundAcceptAttemptedRef.current = false;
    setStatus(`Incoming call from ${caller}`);

    const callId = crypto.randomUUID();
    setActiveCallId(callId);

    void pushEvent('inbound', {
      callId,
      consultant,
      phoneNumber: caller,
      direction: 'inbound',
      status: 'ringing',
    });

    invitation.stateChange.addListener((state) => {
      log('INBOUND.session.state', {
        callId,
        caller,
        state: SessionState[state],
      });
      if (state === SessionState.Established) {
        setInboundSessionActive(true);
        setInboundEstablishedAtMs(Date.now());
        setStatus('Incoming call active');
        bindMedia(invitation);
      }
      if (state === SessionState.Terminated) {
        stopAllCallSounds();
        setStatus('Ready');
        void pushEvent('disconnected', {
          callId,
          consultant,
          phoneNumber: caller,
          status: 'disconnected',
        });
        clearInboundUi();
      }
    });
  }

  const dial = async () => {
    log('DIAL.click', { dialNumber, outgoingNumber, isRegistered });

    if (!isRegistered) {
      logError('DIAL.not-registered', 'SIP not registered yet');
      setStatus('Not registered');
      return;
    }
    if (!userAgentRef.current) {
      logError('DIAL.no-user-agent', 'UserAgent missing');
      return;
    }
    const cleanedDial = normalizeDialInput(dialNumber);
    if (!cleanedDial) {
      logError('DIAL.empty-number');
      return;
    }

    log('DIAL.preflight.mic.start');
    const mic = await testMicrophone();
    if (!mic.ok) {
      logError('DIAL.preflight.mic.failed', mic.error);
      setStatus(`Microphone error: ${mic.error}`);
      setMicStatus('fail');
      return;
    }
    setMicStatus('ok');
    setMicDeviceLabel(mic.label ?? '');
    log('DIAL.preflight.mic.passed', { device: mic.label });

    const target = UserAgent.makeURI(`sip:${cleanedDial}@${appConfig.sipDomain}`);
    if (!target) {
      logError('DIAL.uri.invalid', {
        dialNumber: cleanedDial,
        sipDomain: appConfig.sipDomain,
      });
      setStatus('Invalid phone number');
      return;
    }
    log('DIAL.uri.built', { target: target.toString(), cleanedDial });
    pendingOutboundDialRef.current = cleanedDial;
    setShowOutboundRecordModal(true);
  };

  const executeOutboundDial = async (recordCall: boolean) => {
    setShowOutboundRecordModal(false);
    const cleanedDial = pendingOutboundDialRef.current;
    pendingOutboundDialRef.current = null;
    if (!cleanedDial || !userAgentRef.current) {
      return;
    }

    const target = UserAgent.makeURI(`sip:${cleanedDial}@${appConfig.sipDomain}`);
    if (!target) {
      setStatus('Invalid phone number');
      return;
    }

    const callId = crypto.randomUUID();
    setActiveCallId(callId);
    log('DIAL.callId.assigned', { callId, recordCall });
    outboundTerminalTonePlayedRef.current = false;

    const inviter = new Inviter(userAgentRef.current, target as URI);
    log('DIAL.inviter.created', { callId, dialNumber: cleanedDial, outgoingNumber, recordCall });
    activeSessionRef.current = inviter;
    attachSessionEvents(inviter, callId, cleanedDial);

    const extraHeaders = buildOutboundInviteHeaders(outgoingNumber, recordCall);
    setStatus(`Dialing ${cleanedDial}...`);
    await pushEvent('oncall', {
      callId,
      consultant,
      phoneNumber: cleanedDial,
      outgoingNumber,
      direction: 'outbound',
      status: 'ringing',
    });

    log('DIAL.invite.sending', { callId, target: target.toString(), extraHeaders });
    try {
      await inviter.invite({
        requestOptions: { extraHeaders },
        requestDelegate: {
          onReject: (response) => {
            const sipResponseCode = response.message.statusCode;
            const sipResponseReason = response.message.reasonPhrase;
            logError('DIAL.invite.rejected', {
              callId,
              sipResponseCode,
              sipResponseReason,
            });
            outboundTerminalTonePlayedRef.current = true;
            playOutboundTerminalSound(sipResponseCode ?? undefined);
            setStatus(`Call failed: ${sipResponseCode} ${sipResponseReason}`);
            activeSessionRef.current = undefined;
            setActiveCallId(undefined);
            void pushEvent('failed', {
              callId,
              consultant,
              phoneNumber: cleanedDial,
              outgoingNumber,
              direction: 'outbound',
              status: 'failed',
              sipResponseCode,
              sipResponseReason,
              endReason: 'failed',
            });
          },
        },
      });
      log('DIAL.invite.sent', { callId });
    } catch (err) {
      const e = err as Error;
      logError('DIAL.invite.failed', {
        callId,
        name: e.name,
        message: e.message,
      });
      outboundTerminalTonePlayedRef.current = true;
      playOutboundTerminalSound(undefined);
      setStatus(`Call failed: ${e.message}`);
      activeSessionRef.current = undefined;
      setActiveCallId(undefined);
      void pushEvent('failed', {
        callId,
        consultant,
        phoneNumber: cleanedDial,
        outgoingNumber,
        direction: 'outbound',
        status: 'failed',
        endReason: 'failed',
      });
    }
  };

  const runInboundAction = async (action: () => Promise<void>) => {
    if (inboundActionInFlightRef.current) return;
    inboundActionInFlightRef.current = true;
    setInboundActionInFlight(true);
    try {
      await action();
    } finally {
      inboundActionInFlightRef.current = false;
      setInboundActionInFlight(false);
    }
  };

  const answer = () => {
    void runInboundAction(async () => {
      const invitation = inboundInviteRef.current;
      if (!invitation) return;
      if (inboundRecordChoice === null) {
        setStatus('Choose whether to record before accepting');
        return;
      }
      if (invitation.state === SessionState.Established) {
        setInboundSessionActive(true);
        return;
      }
      if (invitation.state === SessionState.Terminated) return;
      if (inboundAcceptAttemptedRef.current) return;
      inboundAcceptAttemptedRef.current = true;

      setStatus('Checking microphone…');
      const mic = await testMicrophone();
      if (!mic.ok) {
        setMicStatus('fail');
        setMicDeviceLabel(mic.error ?? '');
        setStatus(`Microphone error: ${mic.error}`);
        inboundAcceptAttemptedRef.current = false;
        return;
      }
      setMicStatus('ok');
      setMicDeviceLabel(mic.label ?? '');

      log('INBOUND.answer.click', { recordCall: inboundRecordChoice });
      try {
        await invitation.accept({
          extraHeaders: buildInboundAcceptHeaders(inboundRecordChoice),
        });
        log('INBOUND.answer.accepted');
      } catch (err) {
        logError('INBOUND.answer.failed', {
          state: SessionState[invitation.state],
          message: err instanceof Error ? err.message : String(err),
        });
        inboundAcceptAttemptedRef.current = false;
      }
    });
  };

  const rejectInbound = () => {
    void runInboundAction(async () => {
      const invitation = inboundInviteRef.current;
      if (!invitation) return;
      log('INBOUND.reject.click', { state: SessionState[invitation.state] });
      await dismissInboundInvitation(invitation);
    });
  };

  const hangup = async () => {
    const session = activeSessionRef.current ?? inboundInviteRef.current;
    if (!session) return;

    if (session.state === SessionState.Established) {
      log('HANGUP.bye.established');
      await session.bye();
    } else if (session instanceof Inviter) {
      log('HANGUP.cancel.outbound');
      await session.cancel();
    } else if (session instanceof Invitation) {
      log('HANGUP.inbound.dismiss', { state: SessionState[session.state] });
      await dismissInboundInvitation(session);
      return;
    }
  };

  const isOnCall = !!activeCallId;
  const showIncomingCallModal = !!incomingNumber;

  useEffect(() => {
    if (!inboundSessionActive || !inboundEstablishedAtMs) return;
    const tick = () => {
      setInboundDurationSeconds(Math.floor((Date.now() - inboundEstablishedAtMs) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [inboundSessionActive, inboundEstablishedAtMs]);

  const micDisplayLabel =
    micStatus === 'ok' ? (micDeviceLabel || 'Default') : micStatus === 'fail' ? 'Not available' : 'Checking...';

  const incomingCallOverlay = (
    <IncomingCallModal
      open={showIncomingCallModal}
      callerNumber={incomingNumber}
      recordChoice={inboundRecordChoice}
      isActive={inboundSessionActive}
      durationSeconds={inboundDurationSeconds}
      actionInFlight={inboundActionInFlight}
      onRecordYes={() => setInboundRecordChoice(true)}
      onRecordNo={() => setInboundRecordChoice(false)}
      onAccept={answer}
      onReject={rejectInbound}
      onHangup={() => void hangup()}
    />
  );

  if (appView === 'recordings') {
    return (
      <>
        <RecordingsPage onBack={() => setAppView('call')} />
        {incomingCallOverlay}
        <audio ref={remoteAudioRef} autoPlay />
      </>
    );
  }

  return (
    <main className="app">
      <div className="app-top-row">
        <h1>{UI_TITLE}</h1>
        <button type="button" className="btn-view-recordings" onClick={() => setAppView('recordings')}>
          View call recordings
        </button>
      </div>

      <div className="status-bar">
        <span className={`status-dot ${isRegistered ? 'online' : 'offline'}`} />
        <span className="status-text">{status}</span>
      </div>

      <div className="mic-bar">
        <span className={`mic-dot mic-${micStatus}`} />
        <span className="mic-text">
          Microphone: {micStatus === 'ok' ? `OK (${micDisplayLabel})` : micDisplayLabel}
        </span>
        <button
          type="button"
          className="btn-test-mic"
          onClick={async () => {
            const r = await testMicrophone();
            setMicStatus(r.ok ? 'ok' : 'fail');
            setMicDeviceLabel(r.ok ? (r.label ?? '') : (r.error ?? ''));
          }}
        >
          Test Mic
        </button>
      </div>

      <section className="card">
        <h2>Make a Call</h2>

        <label>
          Call from
          <div className="dropdown" ref={outgoingMenuRef}>
            <button
              type="button"
              className="dropdown-trigger"
              onClick={() => setIsOutgoingMenuOpen((open) => !open)}
              disabled={isOnCall}
            >
              <span>{formatAuNumber(outgoingNumber)}</span>
              <span className="dropdown-caret">▾</span>
            </button>
            {isOutgoingMenuOpen && (
              <ul className="dropdown-menu">
                {outgoingNumbers.map((num) => (
                  <li key={num}>
                    <button
                      type="button"
                      className={`dropdown-item ${num === outgoingNumber ? 'selected' : ''}`}
                      onClick={() => {
                        setOutgoingNumber(num);
                        setIsOutgoingMenuOpen(false);
                      }}
                    >
                      {formatAuNumber(num)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </label>

        <label>
          Call to
          <input
            type="tel"
            placeholder={DIAL_PLACEHOLDER}
            value={dialNumber}
            onChange={(e) => setDialNumber(e.target.value)}
            disabled={isOnCall}
          />
        </label>

        <div className="actions">
          <button
            className="btn-dial"
            onClick={dial}
            disabled={!isRegistered || isOnCall || !dialNumber.trim()}
          >
            Dial
          </button>
          <button className="btn-hangup" onClick={hangup} disabled={!isOnCall}>
            Hangup
          </button>
        </div>
      </section>

      <RecordCallModal
        open={showOutboundRecordModal}
        title="Record this outbound call?"
        onYes={() => void executeOutboundDial(true)}
        onNo={() => void executeOutboundDial(false)}
      />

      {incomingCallOverlay}

      <audio ref={remoteAudioRef} autoPlay />
    </main>
  );
}

export default App;