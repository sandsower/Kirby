import { Text, Box } from 'ink';
import type { Config } from '@kirby/shared-types';

export interface SettingsField {
  label: string;
  key: keyof Config;
  masked?: boolean;
  presets?: { name: string; value: string | null }[];
}

export const AI_PRESETS: { name: string; value: string | null }[] = [
  { name: 'Claude', value: 'claude --continue || claude' },
  { name: 'Codex', value: 'codex' },
  { name: 'Gemini', value: 'gemini' },
  { name: 'Copilot', value: 'gh copilot' },
  { name: 'Custom', value: null },
];

export const SETTINGS_FIELDS: SettingsField[] = [
  { label: 'AI Tool', key: 'aiCommand', presets: AI_PRESETS },
  { label: 'Organization', key: 'org' },
  { label: 'Project', key: 'project' },
  { label: 'Repository', key: 'repo' },
  { label: 'PAT', key: 'pat', masked: true },
  { label: 'Email', key: 'email' },
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
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="magenta">
        Azure DevOps Settings
      </Text>
      <Text dimColor>{'─'.repeat(40)}</Text>
      {SETTINGS_FIELDS.map((field, i) => {
        const selected = i === fieldIndex;
        const isEditing = editingField === field.key;
        const rawValue = String(config[field.key] ?? '');

        let displayValue: string;
        if (field.presets) {
          const matched = field.presets.find((p) => p.value === rawValue);
          if (matched) {
            displayValue = matched.name;
          } else if (rawValue) {
            displayValue = `Custom: ${rawValue}`;
          } else {
            const defaultPreset = field.presets[0];
            displayValue = defaultPreset
              ? defaultPreset.name + ' (default)'
              : '(not set)';
          }
        } else if (field.masked && rawValue.length > 0) {
          displayValue = '*'.repeat(Math.min(rawValue.length, 20));
        } else {
          displayValue = rawValue || '(not set)';
        }

        return (
          <Text key={field.key}>
            <Text color={selected ? 'cyan' : undefined}>
              {selected ? '› ' : '  '}
            </Text>
            <Text bold={selected}>{field.label}: </Text>
            {isEditing ? (
              <Text color="cyan">
                {editBuffer}
                <Text dimColor>_</Text>
              </Text>
            ) : (
              <Text dimColor={!rawValue && !field.presets}>{displayValue}</Text>
            )}
            {selected && field.presets && !isEditing ? (
              <Text dimColor> ←/→ preset · Enter custom</Text>
            ) : null}
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>j/k nav · Enter edit · a auto-detect · Esc back</Text>
      </Box>
    </Box>
  );
}
