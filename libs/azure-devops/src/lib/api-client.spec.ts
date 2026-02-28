import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseReviewer,
  parsePullRequest,
  countActiveThreads,
  deriveBuildStatus,
  fetchActivePullRequests,
  fetchActiveCommentCount,
  fetchPrBuildStatus,
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
    expect(
      parseReviewer({
        displayName: 'Alice',
        uniqueName: 'alice@example.com',
        vote: 10,
      })
    ).toEqual({
      displayName: 'Alice',
      uniqueName: 'alice@example.com',
      vote: 10,
      hasDeclined: false,
    });
  });

  it('defaults missing fields', () => {
    expect(parseReviewer({})).toEqual({
      displayName: 'Unknown',
      uniqueName: '',
      vote: 0,
      hasDeclined: false,
    });
  });

  it('normalizes invalid vote to 0', () => {
    expect(parseReviewer({ displayName: 'Bob', vote: 7 })).toEqual({
      displayName: 'Bob',
      uniqueName: '',
      vote: 0,
      hasDeclined: false,
    });
  });

  it('handles all valid vote values', () => {
    for (const vote of [10, 5, 0, -5, -10]) {
      expect(parseReviewer({ vote }).vote).toBe(vote);
    }
  });

  it('parses hasDeclined when true', () => {
    expect(
      parseReviewer({
        displayName: 'Carol',
        uniqueName: 'carol@example.com',
        vote: 0,
        hasDeclined: true,
      })
    ).toEqual({
      displayName: 'Carol',
      uniqueName: 'carol@example.com',
      vote: 0,
      hasDeclined: true,
    });
  });
});

describe('parsePullRequest', () => {
  it('parses a full PR', () => {
    const result = parsePullRequest({
      pullRequestId: 42,
      title: 'Add feature X',
      sourceRefName: 'refs/heads/feature/my-branch',
      targetRefName: 'refs/heads/main',
      isDraft: true,
      reviewers: [
        { displayName: 'Alice', uniqueName: 'alice@example.com', vote: 10 },
      ],
      createdBy: {
        uniqueName: 'bob@example.com',
        displayName: 'Bob Builder',
      },
    });
    expect(result).toEqual({
      pullRequestId: 42,
      title: 'Add feature X',
      sourceBranch: 'feature/my-branch',
      targetBranch: 'main',
      isDraft: true,
      reviewers: [
        {
          displayName: 'Alice',
          uniqueName: 'alice@example.com',
          vote: 10,
          hasDeclined: false,
        },
      ],
      createdByUniqueName: 'bob@example.com',
      createdByDisplayName: 'Bob Builder',
    });
  });

  it('strips refs/heads/ prefix from both branches', () => {
    const result = parsePullRequest({
      sourceRefName: 'refs/heads/main',
      targetRefName: 'refs/heads/develop',
    });
    expect(result.sourceBranch).toBe('main');
    expect(result.targetBranch).toBe('develop');
  });

  it('defaults missing fields', () => {
    const result = parsePullRequest({});
    expect(result).toEqual({
      pullRequestId: 0,
      title: '',
      sourceBranch: '',
      targetBranch: '',
      isDraft: false,
      reviewers: [],
      createdByUniqueName: undefined,
      createdByDisplayName: undefined,
    });
  });

  it('extracts createdBy uniqueName and displayName', () => {
    const result = parsePullRequest({
      pullRequestId: 99,
      sourceRefName: 'refs/heads/feature/test',
      createdBy: {
        uniqueName: 'user@example.com',
        displayName: 'Test User',
      },
    });
    expect(result.createdByUniqueName).toBe('user@example.com');
    expect(result.createdByDisplayName).toBe('Test User');
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

describe('deriveBuildStatus', () => {
  it('returns succeeded when all statuses are succeeded', () => {
    expect(
      deriveBuildStatus([{ state: 'succeeded' }, { state: 'succeeded' }])
    ).toBe('succeeded');
  });

  it('returns failed when any status is failed', () => {
    expect(
      deriveBuildStatus([{ state: 'succeeded' }, { state: 'failed' }])
    ).toBe('failed');
  });

  it('returns failed when any status is error', () => {
    expect(
      deriveBuildStatus([{ state: 'succeeded' }, { state: 'error' }])
    ).toBe('failed');
  });

  it('returns pending when mix of succeeded and pending', () => {
    expect(
      deriveBuildStatus([{ state: 'succeeded' }, { state: 'pending' }])
    ).toBe('pending');
  });

  it('returns pending for notSet state', () => {
    expect(deriveBuildStatus([{ state: 'notSet' }])).toBe('pending');
  });

  it('returns none for empty array', () => {
    expect(deriveBuildStatus([])).toBe('none');
  });

  it('ignores notApplicable statuses', () => {
    expect(deriveBuildStatus([{ state: 'notApplicable' }])).toBe('none');
  });

  it('returns succeeded when notApplicable mixed with succeeded', () => {
    expect(
      deriveBuildStatus([{ state: 'notApplicable' }, { state: 'succeeded' }])
    ).toBe('succeeded');
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

describe('fetchPrBuildStatus', () => {
  beforeEach(() => mockFetch.mockReset());

  it('calls correct URL and returns derived build status', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        value: [{ state: 'succeeded' }, { state: 'pending' }],
      })
    );

    const result = await fetchPrBuildStatus(testConfig, 42);
    expect(result).toBe('pending');

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/pullrequests/42/statuses');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 403));
    await expect(fetchPrBuildStatus(testConfig, 42)).rejects.toThrow(
      'ADO API error 403'
    );
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
    // PR 42: threads then statuses
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        value: [
          { status: 'active', comments: [{ commentType: 'text' }] },
          { status: 'active', comments: [{ commentType: 'text' }] },
        ],
      })
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ value: [{ state: 'succeeded' }] })
    );
    // PR 43: threads then statuses
    mockFetch.mockResolvedValueOnce(jsonResponse({ value: [] }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ value: [{ state: 'failed' }] })
    );

    const result = await fetchPullRequestsWithComments(testConfig);

    expect(result['feat-a']).toEqual({
      pullRequestId: 42,
      title: '',
      sourceBranch: 'feat-a',
      targetBranch: '',
      isDraft: false,
      reviewers: [
        { displayName: 'Alice', uniqueName: '', vote: 10, hasDeclined: false },
      ],
      activeCommentCount: 2,
      buildStatus: 'succeeded',
      createdByUniqueName: undefined,
      createdByDisplayName: undefined,
    });
    expect(result['feat-b']).toEqual({
      pullRequestId: 43,
      title: '',
      sourceBranch: 'feat-b',
      targetBranch: '',
      isDraft: true,
      reviewers: [],
      activeCommentCount: 0,
      buildStatus: 'failed',
      createdByUniqueName: undefined,
      createdByDisplayName: undefined,
    });
  });
});
