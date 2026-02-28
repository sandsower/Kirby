// Azure DevOps PR types
export type ReviewerVote = 10 | 5 | 0 | -5 | -10;
export type BuildStatusState = 'succeeded' | 'failed' | 'pending' | 'none';

export interface PullRequestReviewer {
  displayName: string;
  uniqueName: string;
  vote: ReviewerVote;
  hasDeclined: boolean;
}

export interface PullRequestInfo {
  pullRequestId: number;
  title: string;
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
  reviewers: PullRequestReviewer[];
  activeCommentCount: number;
  buildStatus: BuildStatusState;
  createdByUniqueName?: string;
  createdByDisplayName?: string;
}

export type ActiveTab = 'sessions' | 'reviews';

export interface CategorizedReviews {
  needsReview: PullRequestInfo[];
  waitingForAuthor: PullRequestInfo[];
  approvedByYou: PullRequestInfo[];
}

export type BranchPrMap = Record<string, PullRequestInfo | null>;

export interface Config {
  /** Azure DevOps personal access token */
  pat?: string;
  /** Azure DevOps organization URL */
  org?: string;
  /** Azure DevOps project name */
  project?: string;
  /** Default repository name */
  repo?: string;
  /** User email (for filtering own PRs) */
  email?: string;
  /** PR data polling interval in ms */
  prPollInterval?: number;
  /** AI tool command to run in new sessions */
  aiCommand?: string;
}

export const DEFAULT_CONFIG: Config = {};

export interface GlobalConfig {
  pat?: string;
  prPollInterval?: number;
  aiCommand?: string;
}

export interface ProjectConfig {
  org?: string;
  project?: string;
  repo?: string;
  email?: string;
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {};
export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {};
