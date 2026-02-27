import { Text, Box } from "ink";
import { branchToSessionName } from "@workflow-manager/tmux-manager";
import type { TmuxSession } from "@workflow-manager/tmux-manager";
import type { BranchPrMap, PullRequestInfo } from "@workflow-manager/shared-types";
import { PrBadge } from "./PrBadge.js";

export function Sidebar({
  sessions,
  selectedIndex,
  focused,
  prMap,
  adoConfigured,
  sidebarWidth,
  orphanPrs,
}: {
  sessions: TmuxSession[];
  selectedIndex: number;
  focused: boolean;
  prMap: BranchPrMap;
  adoConfigured: boolean;
  sidebarWidth: number;
  orphanPrs: PullRequestInfo[];
}) {
  // inner width = sidebarWidth - 2 (paddingX)
  const innerWidth = Math.max(10, sidebarWidth - 2);
  return (
    <Box
      flexDirection="column"
      width={sidebarWidth}
      paddingX={1}
    >
      <Text bold color={focused ? "blue" : "gray"}>
        Sessions
      </Text>
      <Text dimColor>{"─".repeat(innerWidth)}</Text>
      {sessions.length === 0 ? (
        <Text dimColor>(no sessions)</Text>
      ) : (
        sessions.map((s, i) => {
          const selected = i === selectedIndex;
          const icon = s.attached ? "●" : "○";
          const color = s.attached ? "green" : "gray";
          // Find branch for this session by reverse-mapping session name
          const branch = Object.keys(prMap).find(
            (b) => branchToSessionName(b) === s.name
          );
          const pr = branch ? prMap[branch] : undefined;
          return (
            <Box key={s.name} flexDirection="column">
              <Text>
                <Text color={selected ? "cyan" : undefined}>
                  {selected ? "› " : "  "}
                </Text>
                <Text color={color}>{icon} </Text>
                <Text bold={selected}>{s.name}</Text>
              </Text>
              {adoConfigured ? <PrBadge pr={pr} /> : null}
            </Box>
          );
        })
      )}
      {orphanPrs.length > 0 && (
        <>
          <Box marginTop={1}>
            <Text bold color={focused ? "blue" : "gray"}>
              Pull Requests
            </Text>
          </Box>
          <Text dimColor>{"─".repeat(innerWidth)}</Text>
          {orphanPrs.map((pr, i) => {
            const globalIndex = sessions.length + i;
            const selected = globalIndex === selectedIndex;
            return (
              <Box key={pr.pullRequestId} flexDirection="column">
                <Text>
                  <Text color={selected ? "cyan" : undefined}>
                    {selected ? "› " : "  "}
                  </Text>
                  <Text bold={selected}>{pr.sourceBranch}</Text>
                </Text>
                <PrBadge pr={pr} />
              </Box>
            );
          })}
        </>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor><Text color="cyan">n</Text> new session</Text>
        <Text dimColor><Text color="cyan">d</Text> delete branch</Text>
        <Text dimColor><Text color="cyan">Shift+K</Text> kill session</Text>
        <Text dimColor><Text color="cyan">Tab</Text> switch focus</Text>
        <Text dimColor><Text color="cyan">s</Text> settings</Text>
        <Text dimColor><Text color="cyan">q</Text> quit</Text>
      </Box>
    </Box>
  );
}
