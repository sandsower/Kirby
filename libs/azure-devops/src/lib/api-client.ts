import type {
  PullRequestInfo,
  PullRequestReviewer,
  ReviewerVote,
  BranchPrMap,
} from "@workflow-manager/shared-types";

export interface AdoConfig {
  org: string;
  project: string;
  repo: string;
  pat: string;
}

function authHeaders(pat: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

function baseUrl(config: AdoConfig): string {
  return `https://dev.azure.com/${config.org}/${config.project}/_apis/git/repositories/${config.repo}`;
}

// --- Pure parsers (exported for testing) ---

export function parseReviewer(raw: {
  displayName?: string;
  vote?: number;
}): PullRequestReviewer {
  const vote = raw.vote ?? 0;
  const validVotes: ReviewerVote[] = [10, 5, 0, -5, -10];
  return {
    displayName: raw.displayName ?? "Unknown",
    vote: validVotes.includes(vote as ReviewerVote)
      ? (vote as ReviewerVote)
      : 0,
  };
}

export function parsePullRequest(raw: {
  pullRequestId?: number;
  sourceRefName?: string;
  isDraft?: boolean;
  reviewers?: Array<{ displayName?: string; vote?: number }>;
}): Omit<PullRequestInfo, "activeCommentCount"> {
  const branch = (raw.sourceRefName ?? "").replace(/^refs\/heads\//, "");
  return {
    pullRequestId: raw.pullRequestId ?? 0,
    sourceBranch: branch,
    isDraft: raw.isDraft ?? false,
    reviewers: (raw.reviewers ?? []).map(parseReviewer),
  };
}

export function countActiveThreads(
  threads: Array<{
    status?: string;
    comments?: Array<{ commentType?: string }>;
  }>
): number {
  return threads.filter((t) => {
    if (t.status !== "active") return false;
    // Exclude system-only threads (no human comments)
    const hasHumanComment = (t.comments ?? []).some(
      (c) => c.commentType !== "system"
    );
    return hasHumanComment;
  }).length;
}

// --- API functions ---

export async function fetchActivePullRequests(
  config: AdoConfig
): Promise<Array<Omit<PullRequestInfo, "activeCommentCount">>> {
  const url = `${baseUrl(config)}/pullrequests?searchCriteria.status=active&api-version=7.1`;
  const res = await fetch(url, { headers: authHeaders(config.pat) });
  if (!res.ok) {
    throw new Error(`ADO API error ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as { value?: unknown[] };
  return ((data.value ?? []) as Array<Record<string, unknown>>).map(
    parsePullRequest
  );
}

export async function fetchActiveCommentCount(
  config: AdoConfig,
  prId: number
): Promise<number> {
  const url = `${baseUrl(config)}/pullrequests/${prId}/threads?api-version=7.1`;
  const res = await fetch(url, { headers: authHeaders(config.pat) });
  if (!res.ok) {
    throw new Error(`ADO API error ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as { value?: unknown[] };
  return countActiveThreads(
    (data.value ?? []) as Array<{
      status?: string;
      comments?: Array<{ commentType?: string }>;
    }>
  );
}

export async function fetchPullRequestsWithComments(
  config: AdoConfig
): Promise<BranchPrMap> {
  const prs = await fetchActivePullRequests(config);

  // Fetch thread counts in parallel
  const withComments = await Promise.all(
    prs.map(async (pr) => {
      const activeCommentCount = await fetchActiveCommentCount(
        config,
        pr.pullRequestId
      );
      return { ...pr, activeCommentCount } satisfies PullRequestInfo;
    })
  );

  const map: BranchPrMap = {};
  for (const pr of withComments) {
    map[pr.sourceBranch] = pr;
  }
  return map;
}
