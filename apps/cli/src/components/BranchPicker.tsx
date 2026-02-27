import { Text, Box } from "ink";

export function BranchPicker({
  filter,
  branches,
  selectedIndex,
}: {
  filter: string;
  branches: string[];
  selectedIndex: number;
}) {
  const filtered = branches.filter((b) =>
    b.toLowerCase().includes(filter.toLowerCase())
  );
  const hasExactMatch = branches.some(
    (b) => b.toLowerCase() === filter.toLowerCase()
  );

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
      overflow="hidden"
    >
      <Text bold color="yellow">
        Branch Picker
      </Text>
      <Text dimColor>{"─".repeat(40)}</Text>
      {filtered.length === 0 ? (
        <Box flexDirection="column">
          {filter.length > 0 ? (
            <Text color="yellow">
              (new branch) <Text bold>{filter}</Text>
            </Text>
          ) : (
            <Text dimColor>Type to filter branches...</Text>
          )}
        </Box>
      ) : (
        <Box flexDirection="column">
          {filtered.map((b, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Text key={b}>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "› " : "  "}
                </Text>
                <Text bold={isSelected}>{b}</Text>
              </Text>
            );
          })}
          {filter.length > 0 && !hasExactMatch && (
            <Box marginTop={1}>
              <Text dimColor>
                Enter to create: <Text color="yellow">{filter}</Text>
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
