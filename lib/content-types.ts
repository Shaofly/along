export type PostVisibility = "friends" | "selected" | "private";

export type DraftMedia = {
  id: string;
  originalName: string;
  mimeType: string;
};

export type DraftParticipant = {
  id: string;
  name: string;
  realName: string;
  isActive: boolean;
};

export type DraftCircleTarget = {
  id: string;
  name: string;
  status: "active" | "frozen" | "dissolved";
  isActiveMember: boolean;
};

export type DraftSummary = {
  id: string;
  body: string;
  visibility: PostVisibility;
  circleId: string | null;
  circle: DraftCircleTarget | null;
  managementMode: "creator" | "circle";
  media: DraftMedia[];
  mediaCount: number;
  canPublish: boolean;
  unavailableReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DraftDetail = DraftSummary & {
  viewerIds: string[];
  participants: DraftParticipant[];
  circleMembers: DraftParticipant[];
};

export type FeedPost = {
  id: string;
  body: string;
  visibility: PostVisibility;
  publicationStatus: "publishing" | "published" | "failed";
  publicationError: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    image: string | null;
  };
  circle: {
    id: string;
    name: string;
  } | null;
  managementMode: "creator" | "circle";
  lastEditor: {
    id: string;
    name: string;
  } | null;
  canEdit: boolean;
  canDelete: boolean;
  isHistorical: boolean;
  media: Array<{
    id: string;
    originalName: string;
    mimeType: string;
  }>;
  viewerIds: string[];
  participantIds: string[];
  participants: DraftParticipant[];
  circleMembers: DraftParticipant[];
};

export type CircleSummary = {
  id: string;
  name: string;
  description: string;
  status: "active" | "frozen" | "dissolved";
  isActive: boolean;
  isArchived?: boolean;
  capturedAt?: string | null;
  frozenAt?: string | null;
  deleteAt?: string | null;
  canRestore?: boolean;
  members: Array<{
    id: string;
    name: string;
    realName: string;
    image: string | null;
  }>;
  unread: {
    posts: number;
    comments: number;
    replies: number;
    changes: number;
    total: number;
  };
};

export type FriendSummary = {
  id: string;
  name: string;
  realName: string;
  nickname: string | null;
  identityName: string;
  displayName: string;
  remark: string | null;
  image: string | null;
  bio: string;
};
