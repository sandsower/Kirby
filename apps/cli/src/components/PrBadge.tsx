import { Text } from "ink";
import type { PullRequestInfo } from "@workflow-manager/shared-types";

export function PrBadge({ pr }: { pr: PullRequestInfo | null | undefined }) {
  if (pr === null || pr === undefined) {
    return <Text dimColor>{"    (no PR)"}</Text>;
  }

  const approvedCount = pr.reviewers.filter((r) => r.vote >= 5).length;
  const totalReviewers = pr.reviewers.length;
  const hasRejected = pr.reviewers.some((r) => r.vote === -10);
  const hasWaiting = pr.reviewers.some((r) => r.vote === -5);

  let reviewColor: string;
  if (hasRejected) {
    reviewColor = "red";
  } else if (hasWaiting) {
    reviewColor = "yellow";
  } else if (totalReviewers > 0 && approvedCount === totalReviewers) {
    reviewColor = "green";
  } else {
    reviewColor = "gray";
  }

  const reviewText =
    totalReviewers > 0 ? `${approvedCount}/${totalReviewers} approved` : "";

  return (
    <Text>
      <Text dimColor>{"    "}</Text>
      {pr.isDraft ? (
        <Text dimColor>DRAFT </Text>
      ) : null}
      <Text color="blue">PR#{pr.pullRequestId}</Text>
      {reviewText ? (
        <Text color={reviewColor}>{`  ${reviewText}`}</Text>
      ) : null}
      {pr.activeCommentCount > 0 ? (
        <Text color="yellow">{`  ${pr.activeCommentCount} comment${pr.activeCommentCount !== 1 ? "s" : ""}`}</Text>
      ) : null}
    </Text>
  );
}
