import { Text, Box } from "ink";
import type { Config } from "@workflow-manager/shared-types";

export interface SettingsField {
  label: string;
  key: keyof Config;
  masked?: boolean;
}

export const SETTINGS_FIELDS: SettingsField[] = [
  { label: "Organization", key: "org" },
  { label: "Project", key: "project" },
  { label: "Repository", key: "repo" },
  { label: "PAT", key: "pat", masked: true },
  { label: "Email", key: "email" },
];

export function SettingsPanel({
  config,
  fieldIndex,
  editingField,
  editBuffer,
}: {
  config: Config;
  fieldIndex: number;
  editingField: string | null;
  editBuffer: string;
}) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={1}
    >
      <Text bold color="magenta">
        Azure DevOps Settings
      </Text>
      <Text dimColor>{"─".repeat(40)}</Text>
      {SETTINGS_FIELDS.map((field, i) => {
        const selected = i === fieldIndex;
        const isEditing = editingField === field.key;
        const rawValue = String(config[field.key] ?? "");
        const displayValue = field.masked && rawValue.length > 0
          ? "*".repeat(Math.min(rawValue.length, 20))
          : rawValue || "(not set)";

        return (
          <Text key={field.key}>
            <Text color={selected ? "cyan" : undefined}>
              {selected ? "› " : "  "}
            </Text>
            <Text bold={selected}>{field.label}: </Text>
            {isEditing ? (
              <Text color="cyan">
                {editBuffer}
                <Text dimColor>_</Text>
              </Text>
            ) : (
              <Text dimColor={!rawValue}>{displayValue}</Text>
            )}
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>j/k nav · Enter edit · a auto-detect · Esc back</Text>
      </Box>
    </Box>
  );
}
