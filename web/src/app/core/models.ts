export interface User {
  id: string;
  email: string;
  displayName: string | null;
  userType: string;
  lastActiveAt: string | null;
  createdAt: string | null;
}

export interface Profile {
  timezone: string;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Entitlements {
  tier: string;
  status?: string;
  allFeatures?: boolean;
  maxTracks: number | null;
  maxPlaylists: number | null;
  maxConcurrentIngests: number | null;
  historyDays: number;
  remindersPerDay: number;
  customQuietHours: boolean;
  fullInsights: boolean;
  homeAssistant: boolean;
  beta?: boolean;
}

export interface MeResponse {
  user: User;
  profile: Profile;
  tier: string;
  entitlements: Entitlements;
  auth: { type: 'session' | 'bearer'; platform?: string };
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtist: string | null;
  trackNumber: number | null;
  releaseYear: number | null;
  durationSeconds: number;
  genre: string | null;
  mimeType: string;
  fileSizeBytes: number;
  isFavorite: boolean;
  createdBy: string | null;
  storageKind: 'managed' | 'external';
  sourceUrl: string | null;
  sourceKind: string;
  createdAt: string;
  updatedAt: string;
  streamUrl: string;
  artworkUrl: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  visibility: 'private' | 'public';
  ownerId: string;
  ownerName: string | null;
  relationship: 'owner' | 'shared' | 'public';
  myRole: 'owner' | 'editor' | 'viewer';
  canEditTracks: boolean;
  canManage: boolean;
  canEdit: boolean;
  revision: number;
  shareCount: number;
  trackCount: number;
  durationSeconds: number;
  artworkUrl: string | null;
  createdAt: string;
  updatedAt: string;
  tracks?: Track[];
}

export interface PlaylistShare {
  userId: string;
  displayName: string | null;
  email: string;
  role: 'viewer' | 'editor';
  sharedAt: string;
}

export interface DirectoryUser {
  id: string;
  displayName: string | null;
  email: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  userType: 'user' | 'admin';
  lastActiveAt: string | null;
  createdAt: string;
}

export interface InstanceSettings {
  allowRegistration: boolean;
  updatedAt: string;
}

export interface AlbumSummary {
  album: string;
  artist: string;
  trackCount: number;
  durationSeconds: number;
  sampleTrackId: string;
  artworkUrl: string | null;
  createdAt: string;
}

export interface TrackSummary {
  counts: {
    tracks: number;
    playlists: number;
    albums: number;
    favorites: number;
    durationSeconds: number;
  };
  recentlyAdded: Track[];
  favorites: Track[];
}

export interface QueueItem {
  queueId: string;
  position: number;
  track: Track;
}

export interface PlayerState {
  state: {
    currentTrackId: string | null;
    positionSeconds: number;
    volume: number;
    isPlaying: boolean;
    repeatMode: 'off' | 'all' | 'one';
    shuffle: boolean;
    contextType: string | null;
    contextId: string | null;
    revision: number;
    lastAction: string | null;
    updatedAt: string;
  };
  current: Track | null;
  queue: QueueItem[];
  queueIndex: number;
  activePlayers: number;
  announcement: {
    id: string;
    message: string;
    createdAt: string;
    expiresAt: string;
  } | null;
  serverTime: string;
}

export interface IngestJob {
  id: string;
  sourceUrl: string;
  sourceKind: 'auto' | 'track' | 'playlist';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  title: string | null;
  itemCount: number;
  resultCount: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface HomeAssistantIntegration {
  baseUrl: string;
  activePlayers: number;
  tokens: Array<{
    id: string;
    label: string;
    hint: string;
    lastUsedAt: string | null;
    expiresAt: string;
    createdAt: string;
  }>;
  endpoints: {
    state: string;
    command: string;
    webhook: string;
    playlists: string;
    announcements: string;
  };
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  morningPlan: boolean;
  morningTime: string;
  quietStart: string;
  quietEnd: string;
  dayEnd: string;
  maxPerDay: number;
  hideDetails: boolean;
}

export interface LocalPlanNotification {
  key: string;
  kind: string;
  title: string;
  body: string;
  scheduledAt: string;
  actionTypeId?: string;
  data: Record<string, string>;
}

export interface LocalPlan {
  timezone: string;
  generatedAt: string;
  days: number;
  notifications: LocalPlanNotification[];
}
