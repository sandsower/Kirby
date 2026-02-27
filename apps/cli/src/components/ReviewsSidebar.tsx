import { Text, Box } from 'ink';
import type { CategorizedReviews, PullRequestInfo } from '@kirby/shared-types';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

function ReviewSection({
  title,
  titleColor,
  prs,
  startIndex,
  selectedIndex,
  innerWidth,
}: {
  title: string;
  titleColor: string;
  prs: PullRequestInfo[];
  startIndex: number;
  selectedIndex: number;
  innerWidth: number;
}) {
  if (prs.length === 0) return null;
  return (
    <>
      <Box marginTop={1}>
        <Text bold color={titleColor}>
          {title} ({prs.length})
        </Text>
      </Box>
      <Text dimColor>{'─'.repeat(innerWidth)}</Text>
      {prs.map((pr, i) => {
        const selected = startIndex + i === selectedIndex;
        return (
          <Box key={pr.pullRequestId} flexDirection="column">
            <Text>
              <Text color={selected ? 'cyan' : undefined}>
                {selected ? '› ' : '  '}
              </Text>
              <Text bold={selected}>
                {truncate(pr.title || pr.sourceBranch, innerWidth - 2)}
              </Text>
            </Text>
            <Text dimColor>
              {'    '}#{pr.pullRequestId} · {truncate(pr.sourceBranch, 20)} →{' '}
              {pr.targetBranch}
            </Text>
            <Text dimColor>
              {'    '}by {pr.createdByDisplayName ?? 'unknown'} ·{' '}
              {pr.activeCommentCount} comments · {pr.reviewers.length} reviewers
            </Text>
          </Box>
        );
      })}
    </>
  );
}

export function ReviewsSidebar({
  categorized,
  selectedIndex,
  sidebarWidth,
}: {
  categorized: CategorizedReviews;
  selectedIndex: number;
  sidebarWidth: number;
}) {
  const innerWidth = Math.max(10, sidebarWidth - 2);
  const totalItems =
    categorized.needsReview.length +
    categorized.changesRequested.length +
    categorized.approvedByYou.length;

  const needsReviewStart = 0;
  const changesRequestedStart = categorized.needsReview.length;
  const approvedStart =
    changesRequestedStart + categorized.changesRequested.length;

  return (
    <Box flexDirection="column" width={sidebarWidth} paddingX={1}>
      <Text bold color="blue">
        Reviews
      </Text>
      <Text dimColor>{'─'.repeat(innerWidth)}</Text>
      {totalItems === 0 ? (
        <Text dimColor>(no reviews assigned to you)</Text>
      ) : (
        <>
          <ReviewSection
            title="Needs Your Review"
            titleColor="red"
            prs={categorized.needsReview}
            startIndex={needsReviewStart}
            selectedIndex={selectedIndex}
            innerWidth={innerWidth}
          />
          <ReviewSection
            title="Changes Requested"
            titleColor="yellow"
            prs={categorized.changesRequested}
            startIndex={changesRequestedStart}
            selectedIndex={selectedIndex}
            innerWidth={innerWidth}
          />
          <ReviewSection
            title="Approved by You"
            titleColor="green"
            prs={categorized.approvedByYou}
            startIndex={approvedStart}
            selectedIndex={selectedIndex}
            innerWidth={innerWidth}
          />
        </>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          <Text color="cyan">j/k</Text> navigate
        </Text>
        <Text dimColor>
          <Text color="cyan">1</Text> sessions tab
        </Text>
        <Text dimColor>
          <Text color="cyan">r</Text> refresh
        </Text>
        <Text dimColor>
          <Text color="cyan">q</Text> quit
        </Text>
      </Box>
    </Box>
  );
}
