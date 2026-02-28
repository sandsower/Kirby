import { Text, Box } from 'ink';
import { branchToSessionName } from '@kirby/tmux-manager';
import type { TmuxSession } from '@kirby/tmux-manager';
import type { BranchPrMap, PullRequestInfo } from '@kirby/vcs-core';
import { PrBadge } from './PrBadge.js';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

function OrphanPrSection({
  title,
  prs,
  startIndex,
  selectedIndex,
  focused,
  innerWidth,
  sidebarWidth,
}: {
  title: string;
  prs: PullRequestInfo[];
  startIndex: number;
  selectedIndex: number;
  focused: boolean;
  innerWidth: number;
  sidebarWidth: number;
}) {
  if (prs.length === 0) return null;
  return (
    <>
      <Box marginTop={1}>
        <Text bold color={focused ? 'blue' : 'gray'}>
          {title}
        </Text>
      </Box>
      <Text dimColor>{'─'.repeat(innerWidth)}</Text>
      {prs.map((pr, i) => {
        const selected = startIndex + i === selectedIndex;
        return (
          <Box key={pr.id} flexDirection="column">
            <Text>
              <Text color={selected ? 'cyan' : undefined}>
                {selected ? '› ' : '  '}
              </Text>
              <Text bold={selected}>{truncate(pr.sourceBranch, 42)}</Text>
            </Text>
            <PrBadge pr={pr} sidebarWidth={sidebarWidth} />
          </Box>
        );
      })}
    </>
  );
}

export function Sidebar({
  sessions,
  selectedIndex,
  focused,
  prMap,
  vcsConfigured,
  sidebarWidth,
  orphanPrs,
}: {
  sessions: TmuxSession[];
  selectedIndex: number;
  focused: boolean;
  prMap: BranchPrMap;
  vcsConfigured: boolean;
  sidebarWidth: number;
  orphanPrs: PullRequestInfo[];
}) {
  const innerWidth = Math.max(10, sidebarWidth - 2);
  const activeOrphanPrs = orphanPrs.filter((pr) => pr.isDraft !== true);
  const draftOrphanPrs = orphanPrs.filter((pr) => pr.isDraft === true);

  return (
    <Box flexDirection="column" width={sidebarWidth} paddingX={1}>
      <Text bold color={focused ? 'blue' : 'gray'}>
        🌴 Worktree Sessions
      </Text>
      <Text dimColor>{'─'.repeat(innerWidth)}</Text>
      {sessions.length === 0 ? (
        <Text dimColor>(no sessions)</Text>
      ) : (
        sessions.map((s, i) => {
          const selected = i === selectedIndex;
          const icon = s.windows > 0 ? '●' : '○';
          const color = s.windows > 0 ? 'green' : 'gray';
          const branch = Object.keys(prMap).find(
            (b) => branchToSessionName(b) === s.name
          );
          const pr = branch ? prMap[branch] : undefined;
          return (
            <Box key={s.name} flexDirection="column">
              <Text>
                <Text color={selected ? 'cyan' : undefined}>
                  {selected ? '› ' : '  '}
                </Text>
                <Text color={color}>{icon} </Text>
                <Text bold={selected}>{truncate(s.name, 42)}</Text>
              </Text>
              {vcsConfigured ? (
                <PrBadge pr={pr} sidebarWidth={sidebarWidth} />
              ) : null}
            </Box>
          );
        })
      )}
      <OrphanPrSection
        title="🎪 Pull Requests"
        prs={activeOrphanPrs}
        startIndex={sessions.length}
        selectedIndex={selectedIndex}
        focused={focused}
        innerWidth={innerWidth}
        sidebarWidth={sidebarWidth}
      />
      <OrphanPrSection
        title="✍️ Draft Pull Requests"
        prs={draftOrphanPrs}
        startIndex={sessions.length + activeOrphanPrs.length}
        selectedIndex={selectedIndex}
        focused={focused}
        innerWidth={innerWidth}
        sidebarWidth={sidebarWidth}
      />
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          <Text color="cyan">c</Text> checkout branch
        </Text>
        <Text dimColor>
          <Text color="cyan">d</Text> delete branch
        </Text>
        <Text dimColor>
          <Text color="cyan">shift+k</Text> kill tmux session
        </Text>
        <Text dimColor>
          <Text color="cyan">u</Text> rebase onto master
        </Text>
        <Text dimColor>
          <Text color="cyan">tab</Text> switch focus
        </Text>
        <Text dimColor>
          <Text color="cyan">s</Text> settings
        </Text>
        <Text dimColor>
          <Text color="cyan">q</Text> quit
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>🔧✅ passed 🔧🔥 failed 🔧⏳ pending</Text>
        <Text dimColor>🔔 needs attention ⭐ fully approved</Text>
      </Box>
    </Box>
  );
}
