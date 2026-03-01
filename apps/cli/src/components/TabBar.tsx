import { Text, Box } from 'ink';
import type { ActiveTab } from '../types.js';

export function TabBar({
  activeTab,
  reviewCount,
  vcsConfigured,
}: {
  activeTab: ActiveTab;
  reviewCount: number;
  vcsConfigured: boolean;
}) {
  return (
    <Box gap={1}>
      <Text
        bold={activeTab === 'sessions'}
        color={activeTab === 'sessions' ? 'cyan' : 'gray'}
      >
        [ 1 Sessions ]
      </Text>
      {vcsConfigured ? (
        <Text
          bold={activeTab === 'reviews'}
          color={activeTab === 'reviews' ? 'cyan' : 'gray'}
        >
          [ 2 Reviews
          {reviewCount > 0 ? <Text color="red"> ({reviewCount})</Text> : null} ]
        </Text>
      ) : null}
    </Box>
  );
}
