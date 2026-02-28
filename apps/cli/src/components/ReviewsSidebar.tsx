import { Text, Box } from 'ink';
import type { CategorizedReviews, PullRequestInfo } from '@kirby/vcs-core';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

function buildEmoji(status: string | undefined): string {
  switch (status) {
    case 'failed':
      return ' \uD83D\uDD25';
    case 'succeeded':
      return ' \u2705';
    case 'pending':
      return ' \u23F3';
    default:
      return '';
  }
}

function ReviewSection({
  title,
  titleColor,
  prs,
  selectedPrId,
  innerWidth,
}: {
  title: string;
  titleColor: string;
  prs: PullRequestInfo[];
  selectedPrId: number | undefined;
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
      {prs.map((pr) => {
        const selected = pr.id === selectedPrId;
        return (
          <Box key={pr.id} flexDirection="column">
            <Text>
              <Text color={selected ? 'cyan' : undefined}>
                {selected ? '› ' : '  '}
              </Text>
              <Text bold={selected}>
                {truncate(pr.title || pr.sourceBranch, innerWidth - 4)}
                {buildEmoji(pr.buildStatus)}
              </Text>
            </Text>
            <Text dimColor>
              {'    '}#{pr.id} · {truncate(pr.sourceBranch, 20)} →{' '}
              {pr.targetBranch}
            </Text>
            <Text dimColor>
              {'    '}by {pr.createdByDisplayName || 'unknown'} ·{' '}
              {pr.activeCommentCount ?? 0} comments ·{' '}
              {(pr.reviewers ?? []).length} reviewers
            </Text>
          </Box>
        );
      })}
    </>
  );
}

export function ReviewsSidebar({
  categorized,
  selectedPrId,
  sidebarWidth,
  focused = true,
}: {
  categorized: CategorizedReviews;
  selectedPrId: number | undefined;
  sidebarWidth: number;
  focused?: boolean;
}) {
  const innerWidth = Math.max(10, sidebarWidth - 2);
  const totalItems =
    categorized.needsReview.length +
    categorized.waitingForAuthor.length +
    categorized.approvedByYou.length;

  return (
    <Box flexDirection="column" width={sidebarWidth} paddingX={1}>
      <Text bold color={focused ? 'blue' : 'gray'}>
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
            selectedPrId={selectedPrId}
            innerWidth={innerWidth}
          />
          <ReviewSection
            title="Waiting for Author"
            titleColor="yellow"
            prs={categorized.waitingForAuthor}
            selectedPrId={selectedPrId}
            innerWidth={innerWidth}
          />
          <ReviewSection
            title="Approved by You"
            titleColor="green"
            prs={categorized.approvedByYou}
            selectedPrId={selectedPrId}
            innerWidth={innerWidth}
          />
        </>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          <Text color="cyan">j/k</Text> navigate
        </Text>
        <Text dimColor>
          <Text color="cyan">enter</Text> review with Claude
        </Text>
        <Text dimColor>
          <Text color="cyan">esc</Text> back to sidebar
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
