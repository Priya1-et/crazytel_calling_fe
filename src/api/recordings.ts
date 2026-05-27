import { appConfig } from '../config/env';
import { API_PATHS } from '../config/constants';

export type RecordingDirection = 'incoming' | 'outgoing';

export interface RecordingListItem {
  id: string;
  direction: RecordingDirection;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  streamUrl: string;
}

export async function fetchRecordings(
  direction?: RecordingDirection,
): Promise<RecordingListItem[]> {
  const params = direction ? `?direction=${direction}` : '';
  const res = await fetch(`${appConfig.apiBaseUrl}${API_PATHS.RECORDINGS}${params}`);
  if (!res.ok) {
    throw new Error(`Failed to load recordings (${res.status})`);
  }
  const data = (await res.json()) as { recordings: RecordingListItem[] };
  return data.recordings;
}

export function recordingStreamUrl(relativePath: string): string {
  return `${appConfig.apiBaseUrl}${API_PATHS.RECORDINGS_STREAM}?path=${encodeURIComponent(relativePath)}`;
}
