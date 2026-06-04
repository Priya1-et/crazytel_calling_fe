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
import { setSessionHold, setSessionMediaEnabled } from './utils/sessionHold';
import { buildInboundAcceptHeaders, buildOutboundInviteHeaders } from './utils/sipHeaders';
import {
  isIncomingRingPlaying,
  playIncomingRing,
  playOutboundTerminalSound,
  playRingback,
  stopAllCallSounds,
  stopIncomingRing,
  stopRingback,
  unlockCallAudio,
} from './utils/callSounds';
import {
  ActiveOutboundCallPanel,
  type OutboundCallPhase,
} from './components/ActiveOutboundCallPanel';
import { IncomingCallModal } from './components/IncomingCallModal';
import { MissedCallsPanel } from './components/MissedCallsPanel';
import { RecordCallModal } from './components/RecordCallModal';
import {
  loadMissedCalls,
  mergeMissedCalls,
  normalizeMissedNumber,
  saveMissedCalls,
  type MissedCallEntry,
} from './utils/missedCallsStorage';
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
  const [inboundOnHold, setInboundOnHold] = useState(false);
  const [inboundHoldStartedAtMs, setInboundHoldStartedAtMs] = useState<number | null>(null);
  const [inboundHoldSeconds, setInboundHoldSeconds] = useState(0);
  const [inboundHoldActionInFlight, setInboundHoldActionInFlight] = useState(false);
  const [willDisconnectOngoingCall, setWillDisconnectOngoingCall] = useState(false);
  const [inboundInviteReady, setInboundInviteReady] = useState(false);
  const [missedCalls, setMissedCalls] = useState<MissedCallEntry[]>(() => loadMissedCalls());
  const [outboundPhase, setOutboundPhase] = useState<OutboundCallPhase>('idle');
  const [outboundActiveNumber, setOutboundActiveNumber] = useState('');
  const [outboundEstablishedAtMs, setOutboundEstablishedAtMs] = useState<number | null>(null);
  const [outboundHoldStartedAtMs, setOutboundHoldStartedAtMs] = useState<number | null>(null);
  const [outboundDurationSeconds, setOutboundDurationSeconds] = useState(0);
  const [outboundHoldSeconds, setOutboundHoldSeconds] = useState(0);
  const [outboundHoldActionInFlight, setOutboundHoldActionInFlight] = useState(false);

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
  const inboundCallIdRef = useRef<string | undefined>(undefined);
  const outboundCallIdRef = useRef<string | undefined>(undefined);
  const ongoingCallRef = useRef<Session | undefined>(undefined);
  const ringingInboundAcceptedRef = useRef(false);
  const willDisconnectOngoingCallRef = useRef(false);
  /** Caller we are currently ringing for — avoids poll/SIP double-start and restart after answer */
  const incomingRingCallerRef = useRef<string | null>(null);

  const consultant = appConfig.sipUsername;

  const stopIncomingRingForCaller = () => {
    incomingRingCallerRef.current = null;
    stopIncomingRing();
  };

  const startIncomingRingForCaller = (caller: string) => {
    const norm = normalizeMissedNumber(caller) || caller;
    if (incomingRingCallerRef.current === norm && isIncomingRingPlaying()) return;
    incomingRingCallerRef.current = norm;
    playIncomingRing();
  };

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

  const resetOutboundCallUi = () => {
    setOutboundPhase('idle');
    setOutboundActiveNumber('');
    setOutboundEstablishedAtMs(null);
    setOutboundHoldStartedAtMs(null);
    setOutboundDurationSeconds(0);
    setOutboundHoldSeconds(0);
    setOutboundHoldActionInFlight(false);
    outboundCallIdRef.current = undefined;
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
        setOutboundPhase('connecting');
        setStatus('Ringing...');
        playRingback();
      }
      if (state === SessionState.Established) {
        stopRingback();
        setOutboundPhase('active');
        setOutboundEstablishedAtMs(Date.now());
        setOutboundHoldStartedAtMs(null);
        setOutboundHoldSeconds(0);
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
        outboundCallIdRef.current = undefined;
        ongoingCallRef.current = undefined;
        setActiveCallId(undefined);
        resetOutboundCallUi();
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
            void syncMissedCallsFromApi();
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
      if (result.ok) void unlockCallAudio();
    });
    const unlockOnGesture = () => {
      void unlockCallAudio();
    };
    document.addEventListener('click', unlockOnGesture);
    document.addEventListener('keydown', unlockOnGesture);
    return () => {
      document.removeEventListener('click', unlockOnGesture);
      document.removeEventListener('keydown', unlockOnGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearInboundUi = () => {
    stopIncomingRingForCaller();
    inboundInviteRef.current = undefined;
    setInboundInviteReady(false);
    setIncomingNumber('');
    setInboundRecordChoice(null);
    setInboundSessionActive(false);
    setInboundOnHold(false);
    setInboundEstablishedAtMs(null);
    setInboundHoldStartedAtMs(null);
    setInboundDurationSeconds(0);
    setInboundHoldSeconds(0);
    setInboundActionInFlight(false);
    setInboundHoldActionInFlight(false);
    setWillDisconnectOngoingCall(false);
    willDisconnectOngoingCallRef.current = false;
    inboundCallIdRef.current = undefined;
    inboundAcceptAttemptedRef.current = false;
    ringingInboundAcceptedRef.current = false;
    if (!ongoingCallRef.current) {
      setActiveCallId(undefined);
    }
  };

  const hasEstablishedOutbound = () => {
    const session = activeSessionRef.current;
    return (
      session instanceof Inviter &&
      session.state === SessionState.Established &&
      (outboundPhase === 'active' || outboundPhase === 'on-hold')
    );
  };

  const captureOngoingCallForWaiting = (): boolean => {
    const outbound = activeSessionRef.current;
    if (
      outbound instanceof Inviter &&
      outbound.state !== SessionState.Terminated &&
      outboundPhase !== 'idle'
    ) {
      ongoingCallRef.current = outbound;
      return true;
    }
    const inbound = inboundInviteRef.current;
    if (
      inbound &&
      inbound.state === SessionState.Established &&
      inboundSessionActive
    ) {
      ongoingCallRef.current = inbound;
      return true;
    }
    return false;
  };

  const syncMissedCallsFromApi = async () => {
    const url = `${appConfig.apiBaseUrl}/v1/calls?consultant=${encodeURIComponent(consultant)}&status=missed&limit=50`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const rows = (await res.json()) as Array<{ phoneNumber: string; startTime: string }>;
      setMissedCalls((prev) => {
        const merged = mergeMissedCalls(prev, rows);
        saveMissedCalls(merged);
        return merged;
      });
      log('MISSED.sync.api', { count: rows.length });
    } catch (err) {
      logError('MISSED.sync.api.failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const syncWaitingCallFromApi = async () => {
    // Never poll-driven UI/ring while on an active inbound call (answered).
    if (inboundSessionActive) return;
    if (inboundInviteRef.current?.state === SessionState.Established) return;

    const url = `${appConfig.apiBaseUrl}/v1/calls?consultant=${encodeURIComponent(consultant)}&status=waiting&limit=1`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const rows = (await res.json()) as Array<{ phoneNumber: string }>;
      if (!rows.length) return;
      if (!hasOngoingCall() && outboundPhase === 'idle') return;

      const phone = normalizeMissedNumber(rows[0].phoneNumber) || rows[0].phoneNumber;
      const inv = inboundInviteRef.current;
      if (inv) {
        const inviteCaller = inv.remoteIdentity.uri.user ?? '';
        if (normalizeMissedNumber(inviteCaller) === phone || inviteCaller === phone) return;
      }

      const waiting = captureOngoingCallForWaiting();
      setIncomingNumber(phone);
      setWillDisconnectOngoingCall(waiting);
      willDisconnectOngoingCallRef.current = waiting;
      setInboundInviteReady(false);
      setStatus(`Caller waiting — ${phone} (answer when your phone rings)`);
      // Ring only from SIP INVITE; poll updates banner text only (no playIncomingRing).
      log('WAITING.sync.api', { phoneNumber: phone });
    } catch (err) {
      logError('WAITING.sync.api.failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const addMissedCall = (phoneNumber: string) => {
    const norm = normalizeMissedNumber(phoneNumber);
    if (!norm) return;
    log('MISSED.add', { phoneNumber: norm });
    setMissedCalls((prev) => {
      const filtered = prev.filter((m) => m.phoneNumber !== norm);
      const next: MissedCallEntry[] = [
        { id: crypto.randomUUID(), phoneNumber: norm, at: new Date().toISOString() },
        ...filtered,
      ];
      saveMissedCalls(next);
      return next;
    });
    void pushEvent('missed', {
      callId: crypto.randomUUID(),
      consultant,
      phoneNumber: norm,
      direction: 'inbound',
      status: 'missed',
    });
  };

  const dismissMissedCall = (id: string) => {
    setMissedCalls((prev) => {
      const next = prev.filter((m) => m.id !== id);
      saveMissedCalls(next);
      return next;
    });
  };

  const dismissMissedForNumber = (phoneNumber: string) => {
    const norm = normalizeMissedNumber(phoneNumber);
    setMissedCalls((prev) => {
      const next = prev.filter((m) => m.phoneNumber !== norm);
      saveMissedCalls(next);
      return next;
    });
  };

  const restoreOngoingAfterDeclinedRinging = () => {
    const ongoing = ongoingCallRef.current;
    ongoingCallRef.current = undefined;
    setWillDisconnectOngoingCall(false);
    willDisconnectOngoingCallRef.current = false;
    setInboundRecordChoice(null);
    ringingInboundAcceptedRef.current = false;
    inboundAcceptAttemptedRef.current = false;

    if (!ongoing) {
      setIncomingNumber('');
      inboundInviteRef.current = undefined;
      return;
    }

    if (ongoing instanceof Inviter) {
      activeSessionRef.current = ongoing;
      inboundInviteRef.current = undefined;
      setIncomingNumber('');
      setStatus('Call active');
      return;
    }

    if (ongoing instanceof Invitation) {
      inboundInviteRef.current = ongoing;
      const caller = ongoing.remoteIdentity.uri.user ?? 'unknown';
      setIncomingNumber(caller);
      setInboundSessionActive(true);
      setInboundOnHold(false);
      setStatus('Incoming call active');
      bindMedia(ongoing);
    }
  };

  const disconnectOngoingCalls = async () => {
    const outbound = activeSessionRef.current;
    if (outbound instanceof Inviter && outbound.state !== SessionState.Terminated) {
      log('CALL_WAITING.disconnect.outbound');
      if (outbound.state === SessionState.Established) {
        await outbound.bye();
      } else {
        await outbound.cancel();
      }
      if (outboundCallIdRef.current) {
        void pushEvent('disconnected', {
          callId: outboundCallIdRef.current,
          consultant,
          phoneNumber: outboundActiveNumber,
          status: 'disconnected',
        });
      }
      activeSessionRef.current = undefined;
      resetOutboundCallUi();
    }

    const ongoing = ongoingCallRef.current;
    if (
      ongoing &&
      ongoing !== outbound &&
      ongoing.state === SessionState.Established
    ) {
      log('CALL_WAITING.disconnect.ongoing');
      if (ongoing instanceof Invitation) {
        const caller = ongoing.remoteIdentity.uri.user ?? 'unknown';
        await ongoing.bye();
        void pushEvent('disconnected', {
          callId: inboundCallIdRef.current ?? crypto.randomUUID(),
          consultant,
          phoneNumber: caller,
          status: 'disconnected',
        });
      } else {
        await ongoing.bye();
      }
    }
    ongoingCallRef.current = undefined;
    remoteAudioRef.current?.pause();
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
    const caller = invitation.remoteIdentity.uri.user ?? 'unknown';
    const waiting = captureOngoingCallForWaiting();
    willDisconnectOngoingCallRef.current = waiting;
    log('INBOUND.invite.received', { caller, consultant, callWaiting: waiting });

    ringingInboundAcceptedRef.current = false;
    inboundInviteRef.current = invitation;
    setInboundInviteReady(true);
    setIncomingNumber(caller);
    setInboundRecordChoice(null);
    setInboundSessionActive(false);
    setInboundOnHold(false);
    setInboundEstablishedAtMs(null);
    setInboundHoldStartedAtMs(null);
    setInboundDurationSeconds(0);
    setInboundHoldSeconds(0);
    inboundAcceptAttemptedRef.current = false;
    setWillDisconnectOngoingCall(waiting);
    setStatus(
      waiting
        ? `Incoming while on a call — ${caller} (accept ends current call)`
        : `Incoming call from ${caller}`,
    );

    const callId = crypto.randomUUID();
    inboundCallIdRef.current = callId;
    setActiveCallId(callId);

    void pushEvent('inbound', {
      callId,
      consultant,
      phoneNumber: caller,
      direction: 'inbound',
      status: 'ringing',
    });

    startIncomingRingForCaller(caller);

    invitation.stateChange.addListener((state) => {
      log('INBOUND.session.state', {
        callId,
        caller,
        state: SessionState[state],
      });
      if (state === SessionState.Established) {
        stopIncomingRingForCaller();
        ringingInboundAcceptedRef.current = true;
        ongoingCallRef.current = undefined;
        willDisconnectOngoingCallRef.current = false;
        setWillDisconnectOngoingCall(false);
        setInboundSessionActive(true);
        setInboundOnHold(false);
        setInboundEstablishedAtMs(Date.now());
        setStatus('Incoming call active');
        bindMedia(invitation);
        void pushEvent('oncall', {
          callId,
          consultant,
          phoneNumber: caller,
          direction: 'inbound',
          status: 'answered',
        });
      }
      if (state === SessionState.Terminated) {
        stopAllCallSounds();
        const wasWaitingRing =
          willDisconnectOngoingCallRef.current && !ringingInboundAcceptedRef.current;
        if (wasWaitingRing) {
          addMissedCall(caller);
          inboundInviteRef.current = undefined;
          restoreOngoingAfterDeclinedRinging();
          void pushEvent('disconnected', {
            callId,
            consultant,
            phoneNumber: caller,
            status: 'missed',
          });
        } else {
          clearInboundUi();
          setStatus('Ready');
          void pushEvent('disconnected', {
            callId,
            consultant,
            phoneNumber: caller,
            status: 'disconnected',
          });
        }
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
    dismissMissedForNumber(cleanedDial);

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
    outboundCallIdRef.current = callId;
    setActiveCallId(callId);
    log('DIAL.callId.assigned', { callId, recordCall });
    outboundTerminalTonePlayedRef.current = false;

    const inviter = new Inviter(userAgentRef.current, target as URI);
    log('DIAL.inviter.created', { callId, dialNumber: cleanedDial, outgoingNumber, recordCall });
    activeSessionRef.current = inviter;
    setOutboundActiveNumber(cleanedDial);
    setOutboundPhase('connecting');
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
            resetOutboundCallUi();
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
      resetOutboundCallUi();
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

  const holdOutbound = () => {
    void (async () => {
      const session = activeSessionRef.current;
      if (outboundPhase !== 'active' || !session || session.state !== SessionState.Established) {
        return;
      }
      if (outboundHoldActionInFlight) return;
      setOutboundHoldActionInFlight(true);
      log('OUTBOUND.hold.click', { number: outboundActiveNumber });
      try {
        await setSessionHold(session, true);
        remoteAudioRef.current?.pause();
        setOutboundPhase('on-hold');
        setOutboundHoldStartedAtMs(Date.now());
        setStatus('Call on hold');
        if (outboundCallIdRef.current) {
          void pushEvent('hold', {
            callId: outboundCallIdRef.current,
            consultant,
            phoneNumber: outboundActiveNumber,
            direction: 'outbound',
            status: 'on-hold',
          });
        }
      } catch (err) {
        logError('OUTBOUND.hold.failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        setStatus('Hold failed — try again');
      } finally {
        setOutboundHoldActionInFlight(false);
      }
    })();
  };

  const resumeOutbound = () => {
    void (async () => {
      const session = activeSessionRef.current;
      if (outboundPhase !== 'on-hold' || !session || session.state !== SessionState.Established) {
        return;
      }
      if (outboundHoldActionInFlight) return;
      setOutboundHoldActionInFlight(true);
      log('OUTBOUND.resume.click', { number: outboundActiveNumber });
      try {
        await setSessionHold(session, false);
        setSessionMediaEnabled(session, true);
        bindMedia(session);
        void remoteAudioRef.current?.play().catch(() => null);
        setOutboundPhase('active');
        setOutboundHoldStartedAtMs(null);
        setOutboundHoldSeconds(0);
        setStatus('Call active');
        if (outboundCallIdRef.current) {
          void pushEvent('resume', {
            callId: outboundCallIdRef.current,
            consultant,
            phoneNumber: outboundActiveNumber,
            direction: 'outbound',
            status: 'answered',
          });
        }
      } catch (err) {
        logError('OUTBOUND.resume.failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        setStatus('Resume failed — try again');
      } finally {
        setOutboundHoldActionInFlight(false);
      }
    })();
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
        stopIncomingRingForCaller();
        setInboundSessionActive(true);
        return;
      }
      if (invitation.state === SessionState.Terminated) return;
      if (inboundAcceptAttemptedRef.current) return;
      inboundAcceptAttemptedRef.current = true;

      stopIncomingRingForCaller();
      const caller = invitation.remoteIdentity.uri.user ?? incomingNumber;
      void pushEvent('oncall', {
        callId: inboundCallIdRef.current ?? crypto.randomUUID(),
        consultant,
        phoneNumber: caller,
        direction: 'inbound',
        status: 'answered',
      });

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

      if (willDisconnectOngoingCall || ongoingCallRef.current) {
        try {
          await disconnectOngoingCalls();
        } catch (err) {
          logError('CALL_WAITING.disconnect.failed', {
            message: err instanceof Error ? err.message : String(err),
          });
          setStatus('Could not end other call — try again');
          inboundAcceptAttemptedRef.current = false;
          return;
        }
      }

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
      if (!invitation) {
        const caller = incomingNumber;
        stopIncomingRingForCaller();
        clearInboundUi();
        if (caller && (willDisconnectOngoingCall || ongoingCallRef.current)) {
          addMissedCall(caller);
          restoreOngoingAfterDeclinedRinging();
          setStatus('Missed call — ongoing call continues');
        } else {
          setStatus('Ready');
        }
        return;
      }
      const caller = incomingNumber;
      const wasWaiting = willDisconnectOngoingCall;
      log('INBOUND.reject.click', { state: SessionState[invitation.state], wasWaiting });
      stopIncomingRingForCaller();
      try {
        if (
          invitation.state === SessionState.Initial ||
          invitation.state === SessionState.Establishing
        ) {
          await invitation.reject();
        }
      } catch (err) {
        logError('INBOUND.reject.failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      if (wasWaiting) {
        addMissedCall(caller);
        inboundInviteRef.current = undefined;
        restoreOngoingAfterDeclinedRinging();
        setStatus('Missed call — ongoing call continues');
      } else {
        await dismissInboundInvitation(invitation);
      }
    });
  };

  const holdInbound = () => {
    void (async () => {
      const invitation = inboundInviteRef.current;
      if (!inboundSessionActive || inboundOnHold || !invitation || invitation.state !== SessionState.Established) {
        return;
      }
      if (inboundHoldActionInFlight) return;
      setInboundHoldActionInFlight(true);
      log('INBOUND.hold.click', { caller: incomingNumber });
      try {
        await setSessionHold(invitation, true);
        remoteAudioRef.current?.pause();
        setInboundOnHold(true);
        setInboundHoldStartedAtMs(Date.now());
        setStatus('Inbound call on hold');
        if (inboundCallIdRef.current) {
          void pushEvent('hold', {
            callId: inboundCallIdRef.current,
            consultant,
            phoneNumber: incomingNumber,
            direction: 'inbound',
            status: 'on-hold',
          });
        }
      } catch (err) {
        logError('INBOUND.hold.failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        setStatus('Hold failed — try again');
      } finally {
        setInboundHoldActionInFlight(false);
      }
    })();
  };

  const resumeInbound = () => {
    void (async () => {
      const invitation = inboundInviteRef.current;
      if (!inboundOnHold || !invitation || invitation.state !== SessionState.Established) {
        return;
      }
      if (inboundHoldActionInFlight) return;
      setInboundHoldActionInFlight(true);
      log('INBOUND.resume.click', { caller: incomingNumber });
      try {
        await setSessionHold(invitation, false);
        setSessionMediaEnabled(invitation, true);
        bindMedia(invitation);
        void remoteAudioRef.current?.play().catch(() => null);
        setInboundOnHold(false);
        setInboundHoldStartedAtMs(null);
        setInboundHoldSeconds(0);
        setStatus('Incoming call active');
        if (inboundCallIdRef.current) {
          void pushEvent('resume', {
            callId: inboundCallIdRef.current,
            consultant,
            phoneNumber: incomingNumber,
            direction: 'inbound',
            status: 'answered',
          });
        }
      } catch (err) {
        logError('INBOUND.resume.failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        setStatus('Resume failed — try again');
      } finally {
        setInboundHoldActionInFlight(false);
      }
    })();
  };

  const hangupInbound = async () => {
    const invitation = inboundInviteRef.current;
    if (!invitation) return;
    log('HANGUP.inbound', { state: SessionState[invitation.state] });
    if (invitation.state === SessionState.Established) {
      await invitation.bye();
    } else {
      await dismissInboundInvitation(invitation);
    }
  };

  const hangupOutbound = async () => {
    const session = activeSessionRef.current;
    if (!session) return;
    if (session.state === SessionState.Established) {
      log('HANGUP.outbound.bye');
      await session.bye();
    } else if (session instanceof Inviter) {
      log('HANGUP.outbound.cancel');
      await session.cancel();
    }
  };

  const callBackMissed = (phoneNumber: string) => {
    dismissMissedForNumber(phoneNumber);
    setDialNumber(phoneNumber);
    setStatus(`Ready to call back ${formatAuNumber(phoneNumber)} — tap Dial`);
    log('MISSED.callback', { phoneNumber });
  };

  const hangup = async () => {
    if (inboundInviteRef.current && (inboundSessionActive || incomingNumber)) {
      await hangupInbound();
      return;
    }
    await hangupOutbound();
  };

  const isOnCall =
    !!activeCallId || outboundPhase !== 'idle' || !!incomingNumber;
  const showIncomingCallModal = !!incomingNumber;
  const showOutboundCallPanel = outboundPhase !== 'idle' && !!outboundActiveNumber;

  useEffect(() => {
    if (
      !outboundEstablishedAtMs ||
      (outboundPhase !== 'active' && outboundPhase !== 'on-hold')
    ) {
      return;
    }
    const tick = () => {
      setOutboundDurationSeconds(Math.floor((Date.now() - outboundEstablishedAtMs) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [outboundEstablishedAtMs, outboundPhase]);

  useEffect(() => {
    if (outboundPhase !== 'on-hold' || !outboundHoldStartedAtMs) return;
    const tick = () => {
      setOutboundHoldSeconds(Math.floor((Date.now() - outboundHoldStartedAtMs) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [outboundPhase, outboundHoldStartedAtMs]);

  useEffect(() => {
    if (!inboundSessionActive || !inboundEstablishedAtMs) return;
    const tick = () => {
      setInboundDurationSeconds(Math.floor((Date.now() - inboundEstablishedAtMs) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [inboundSessionActive, inboundEstablishedAtMs]);

  useEffect(() => {
    if (!inboundOnHold || !inboundHoldStartedAtMs) return;
    const tick = () => {
      setInboundHoldSeconds(Math.floor((Date.now() - inboundHoldStartedAtMs) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [inboundOnHold, inboundHoldStartedAtMs]);

  useEffect(() => {
    if (!isRegistered) return;
    const id = window.setInterval(() => {
      void syncMissedCallsFromApi();
      if (!inboundSessionActive) {
        void syncWaitingCallFromApi();
      }
    }, 15000);
    return () => window.clearInterval(id);
  }, [isRegistered, consultant, inboundSessionActive]);

  const micDisplayLabel =
    micStatus === 'ok' ? (micDeviceLabel || 'Default') : micStatus === 'fail' ? 'Not available' : 'Checking...';

  const incomingCallOverlay = (
    <IncomingCallModal
      open={showIncomingCallModal}
      callerNumber={incomingNumber}
      recordChoice={inboundRecordChoice}
      isActive={inboundSessionActive}
      isOnHold={inboundOnHold}
      willDisconnectOngoingCall={willDisconnectOngoingCall && !inboundSessionActive}
      sipInvitePending={!inboundInviteReady && !inboundSessionActive}
      durationSeconds={inboundDurationSeconds}
      holdDurationSeconds={inboundHoldSeconds}
      actionInFlight={inboundActionInFlight}
      holdActionInFlight={inboundHoldActionInFlight}
      onRecordYes={() => setInboundRecordChoice(true)}
      onRecordNo={() => setInboundRecordChoice(false)}
      onAccept={answer}
      onReject={rejectInbound}
      onHold={holdInbound}
      onResume={resumeInbound}
      onHangup={() => void hangupInbound()}
    />
  );

  const missedCallsPanel = (
    <MissedCallsPanel
      calls={missedCalls}
      onCallBack={callBackMissed}
      onDismiss={dismissMissedCall}
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

      {missedCallsPanel}

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

      {showOutboundCallPanel ? (
        <ActiveOutboundCallPanel
          phase={outboundPhase}
          dialNumber={outboundActiveNumber}
          callDurationSeconds={outboundDurationSeconds}
          holdDurationSeconds={outboundHoldSeconds}
          holdActionInFlight={outboundHoldActionInFlight}
          onHold={holdOutbound}
          onResume={resumeOutbound}
          onHangup={() => void hangupOutbound()}
        />
      ) : (
        <section className="card card-dial">
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
            <button
              className="btn-hangup btn-hangup--secondary"
              onClick={() => void hangup()}
              disabled={!isOnCall}
              aria-hidden={!isOnCall}
            >
              Hangup
            </button>
          </div>
        </section>
      )}

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