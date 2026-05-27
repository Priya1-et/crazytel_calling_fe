import { SIP_HEADER_OUTGOING_NUMBER, SIP_HEADER_RECORD_CALL } from '../config/constants';

export function buildOutboundInviteHeaders(
  outgoingNumber: string,
  recordCall: boolean,
): string[] {
  const headers = [`${SIP_HEADER_OUTGOING_NUMBER}: ${outgoingNumber}`];
  if (recordCall) {
    headers.push(`${SIP_HEADER_RECORD_CALL}: 1`);
  }
  return headers;
}

export function buildInboundAcceptHeaders(recordCall: boolean): string[] {
  return recordCall ? [`${SIP_HEADER_RECORD_CALL}: 1`] : [];
}
