import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseReviewer,
  parsePullRequest,
  countActiveThreads,
  fetchActivePullRequests,
  fetchActiveCommentCount,
  fetchPullRequestsWithComments,
} from './api-client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  } as Response;
}

const testConfig = {
  org: 'myorg',
  project: 'myproject',
  repo: 'myrepo',
  pat: 'test-pat',
};

describe('parseReviewer', () => {
  it('parses a valid reviewer', () => {
    expect(parseReviewer({ displayName: 'Alice', vote: 10 })).toEqual({
      displayName: 'Alice',
      vote: 10,
    });
  });

  it('defaults missing fields', () => {
    expect(parseReviewer({})).toEqual({
      displayName: 'Unknown',
      vote: 0,
    });
  });

  it('normalizes invalid vote to 0', () => {
    expect(parseReviewer({ displayName: 'Bob', vote: 7 })).toEqual({
      displayName: 'Bob',
      vote: 0,
    });
  });

  it('handles all valid vote values', () => {
    for (const vote of [10, 5, 0, -5, -10]) {
      expect(parseReviewer({ vote }).vote).toBe(vote);
    }
  });
});

describe('parsePullRequest', () => {
  it('parses a full PR', () => {
    const result = parsePullRequest({
      pullRequestId: 42,
      sourceRefName: 'refs/heads/feature/my-branch',
      isDraft: true,
      reviewers: [{ displayName: 'Alice', vote: 10 }],
    });
    expect(result).toEqual({
      pullRequestId: 42,
      sourceBranch: 'feature/my-branch',
      isDraft: true,
      reviewers: [{ displayName: 'Alice', vote: 10 }],
      createdByUniqueName: undefined,
    });
  });

  it('strips refs/heads/ prefix', () => {
    const result = parsePullRequest({
      sourceRefName: 'refs/heads/main',
    });
    expect(result.sourceBranch).toBe('main');
  });

  it('defaults missing fields', () => {
    const result = parsePullRequest({});
    expect(result).toEqual({
      pullRequestId: 0,
      sourceBranch: '',
      isDraft: false,
      reviewers: [],
      createdByUniqueName: undefined,
    });
  });

  it('extracts createdBy uniqueName', () => {
    const result = parsePullRequest({
      pullRequestId: 99,
      sourceRefName: 'refs/heads/feature/test',
      createdBy: { uniqueName: 'user@example.com' },
    });
    expect(result.createdByUniqueName).toBe('user@example.com');
  });
});

describe('countActiveThreads', () => {
  it('counts active threads with human comments', () => {
    const threads = [
      {
        status: 'active',
        comments: [{ commentType: 'text' }],
      },
      {
        status: 'active',
        comments: [{ commentType: 'text' }, { commentType: 'system' }],
      },
    ];
    expect(countActiveThreads(threads)).toBe(2);
  });

  it('ignores resolved threads', () => {
    const threads = [
      { status: 'fixed', comments: [{ commentType: 'text' }] },
      { status: 'closed', comments: [{ commentType: 'text' }] },
    ];
    expect(countActiveThreads(threads)).toBe(0);
  });

  it('ignores system-only threads', () => {
    const threads = [
      { status: 'active', comments: [{ commentType: 'system' }] },
    ];
    expect(countActiveThreads(threads)).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(countActiveThreads([])).toBe(0);
  });

  it('handles threads with no comments', () => {
    expect(countActiveThreads([{ status: 'active' }])).toBe(0);
  });
});

describe('fetchActivePullRequests', () => {
  beforeEach(() => mockFetch.mockReset());

  it('calls correct URL and returns parsed PRs', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        value: [
          {
            pullRequestId: 42,
            sourceRefName: 'refs/heads/my-feature',
            isDraft: false,
            reviewers: [{ displayName: 'Alice', vote: 10 }],
          },
        ],
      })
    );

    const result = await fetchActivePullRequests(testConfig);

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain(
      'myorg/myproject/_apis/git/repositories/myrepo/pullrequests'
    );
    expect(calledUrl).toContain('searchCriteria.status=active');
    expect(result).toHaveLength(1);
    expect(result[0]!.sourceBranch).toBe('my-feature');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(fetchActivePullRequests(testConfig)).rejects.toThrow(
      'ADO API error 401'
    );
  });

  it('sends Basic auth header', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ value: [] }));
    await fetchActivePullRequests(testConfig);

    const headers = mockFetch.mock.calls[0]![1]?.headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toMatch(/^Basic /);
    const decoded = Buffer.from(
      headers.Authorization.replace('Basic ', ''),
      'base64'
    ).toString();
    expect(decoded).toBe(':test-pat');
  });
});

describe('fetchActiveCommentCount', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns count of active non-system threads', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        value: [
          { status: 'active', comments: [{ commentType: 'text' }] },
          { status: 'active', comments: [{ commentType: 'system' }] },
          { status: 'fixed', comments: [{ commentType: 'text' }] },
        ],
      })
    );

    const count = await fetchActiveCommentCount(testConfig, 42);
    expect(count).toBe(1);

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/pullrequests/42/threads');
  });
});

describe('fetchPullRequestsWithComments', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns a map of branch to PR info with comment counts', async () => {
    // First call: list PRs
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        value: [
          {
            pullRequestId: 42,
            sourceRefName: 'refs/heads/feat-a',
            isDraft: false,
            reviewers: [{ displayName: 'Alice', vote: 10 }],
          },
          {
            pullRequestId: 43,
            sourceRefName: 'refs/heads/feat-b',
            isDraft: true,
            reviewers: [],
          },
        ],
      })
    );
    // Thread calls for each PR
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        value: [
          { status: 'active', comments: [{ commentType: 'text' }] },
          { status: 'active', comments: [{ commentType: 'text' }] },
        ],
      })
    );
    mockFetch.mockResolvedValueOnce(jsonResponse({ value: [] }));

    const result = await fetchPullRequestsWithComments(testConfig);

    expect(result['feat-a']).toEqual({
      pullRequestId: 42,
      sourceBranch: 'feat-a',
      isDraft: false,
      reviewers: [{ displayName: 'Alice', vote: 10 }],
      activeCommentCount: 2,
    });
    expect(result['feat-b']).toEqual({
      pullRequestId: 43,
      sourceBranch: 'feat-b',
      isDraft: true,
      reviewers: [],
      activeCommentCount: 0,
    });
  });
});
