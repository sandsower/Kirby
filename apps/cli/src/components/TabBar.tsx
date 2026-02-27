import { Text, Box } from 'ink';
import type { ActiveTab } from '@kirby/shared-types';

export function TabBar({
  activeTab,
  reviewCount,
}: {
  activeTab: ActiveTab;
  reviewCount: number;
}) {
  return (
    <Box paddingX={1} gap={2}>
      <Text
        bold={activeTab === 'sessions'}
        color={activeTab === 'sessions' ? 'cyan' : 'gray'}
      >
        1 Sessions
      </Text>
      <Text
        bold={activeTab === 'reviews'}
        color={activeTab === 'reviews' ? 'cyan' : 'gray'}
      >
        2 Reviews
        {reviewCount > 0 ? <Text color="red"> ({reviewCount})</Text> : null}
      </Text>
    </Box>
  );
}
