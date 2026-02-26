export type SessionStatus = "running" | "idle" | "waiting" | "stopped";

// Azure DevOps PR types
export type ReviewerVote = 10 | 5 | 0 | -5 | -10;

export interface PullRequestReviewer {
  displayName: string;
  vote: ReviewerVote;
}

export interface PullRequestInfo {
  pullRequestId: number;
  sourceBranch: string;
  isDraft: boolean;
  reviewers: PullRequestReviewer[];
  activeCommentCount: number;
}

export type BranchPrMap = Record<string, PullRequestInfo | null>;

export interface Session {
  /** Unique session name (also used as tmux session name) */
  name: string;
  /** Current detected status */
  status: SessionStatus;
  /** Timestamp when session was created */
  createdAt: string;
  /** Timestamp of last status check */
  lastCheckedAt: string;
  /** Associated work item ID, if any */
  workItemId?: number;
  /** Associated branch name */
  branch?: string;
}

export interface SessionStore {
  sessions: Session[];
}

export interface Config {
  /** Azure DevOps personal access token */
  pat?: string;
  /** Azure DevOps organization URL */
  org?: string;
  /** Azure DevOps project name */
  project?: string;
  /** Default repository name */
  repo?: string;
  /** capture-pane polling interval in ms */
  pollInterval: number;
  /** PR data polling interval in ms */
  prPollInterval?: number;
}

export const DEFAULT_CONFIG: Config = {
  pollInterval: 500,
};
