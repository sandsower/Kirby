import { useMemo } from 'react';
import { Text, Box } from 'ink';
import type { AppConfig, VcsProvider } from '@kirby/vcs-core';

export interface SettingsField {
  label: string;
  key: string;
  masked?: boolean;
  presets?: { name: string; value: string | null }[];
  /** Which config bag this field lives in */
  configBag: 'global' | 'project' | 'vendorAuth' | 'vendorProject';
}

export const AI_PRESETS: { name: string; value: string | null }[] = [
  { name: 'Claude', value: 'claude --continue || claude' },
  { name: 'Codex', value: 'codex' },
  { name: 'Gemini', value: 'gemini' },
  { name: 'Copilot', value: 'gh copilot' },
  { name: 'Custom', value: null },
];

/** Build the settings field list dynamically from the active provider */
export function buildSettingsFields(
  provider: VcsProvider | null
): SettingsField[] {
  const fields: SettingsField[] = [
    {
      label: 'AI Tool',
      key: 'aiCommand',
      presets: AI_PRESETS,
      configBag: 'global',
    },
    { label: 'Email', key: 'email', configBag: 'project' },
  ];

  if (provider) {
    for (const f of provider.authFields) {
      fields.push({
        label: f.label,
        key: f.key,
        masked: f.masked,
        configBag: 'vendorAuth',
      });
    }
    for (const f of provider.projectFields) {
      fields.push({
        label: f.label,
        key: f.key,
        configBag: 'vendorProject',
      });
    }
  }

  return fields;
}

/** Resolve the display value from config for a settings field */
export function resolveValue(config: AppConfig, field: SettingsField): string {
  switch (field.configBag) {
    case 'global':
    case 'project':
      return String(
        (config as unknown as Record<string, unknown>)[field.key] ?? ''
      );
    case 'vendorAuth':
      return String(config.vendorAuth[field.key] ?? '');
    case 'vendorProject':
      return String(config.vendorProject[field.key] ?? '');
  }
}

export function SettingsPanel({
  config,
  provider,
  fieldIndex,
  editingField,
  editBuffer,
}: {
  config: AppConfig;
  provider: VcsProvider | null;
  fieldIndex: number;
  editingField: string | null;
  editBuffer: string;
}) {
  const fields = useMemo(() => buildSettingsFields(provider), [provider]);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="magenta">
        Settings
        {provider ? <Text dimColor> ({provider.displayName})</Text> : null}
      </Text>
      <Text dimColor>{'─'.repeat(40)}</Text>
      {fields.map((field, i) => {
        const selected = i === fieldIndex;
        const isEditing = editingField === field.key;
        const rawValue = resolveValue(config, field);

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
