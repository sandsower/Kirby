import { useState, useEffect } from 'react';
import { Text, Box, useInput } from 'ink';
import { useConfig } from '../context/ConfigContext.js';
import { checkGhAuth } from '@kirby/vcs-github';
import { BOOL_PRESETS, resolveValue } from './SettingsPanel.js';
import type { SettingsField } from './SettingsPanel.js';

type Step = 'welcome' | 'fields' | 'preferences' | 'done';

interface PrefItem {
  field: SettingsField;
  description: string;
}

const PREF_ITEMS: PrefItem[] = [
  {
    field: {
      label: 'Auto Delete on Merge',
      key: 'autoDeleteOnMerge',
      presets: BOOL_PRESETS,
      configBag: 'global',
    },
    description: 'Remove merged worktree branches automatically',
  },
  {
    field: {
      label: 'Auto Rebase',
      key: 'autoRebase',
      presets: BOOL_PRESETS,
      configBag: 'global',
    },
    description: 'Rebase worktree branches onto master after sync',
  },
];

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { config, provider, updateField } = useConfig();
  const [step, setStep] = useState<Step>('welcome');
  const [fieldIndex, setFieldIndex] = useState(0);
  const [editBuffer, setEditBuffer] = useState('');
  const [editing, setEditing] = useState(false);
  const [ghUsername, setGhUsername] = useState<string | null>(null);
  const [ghChecked, setGhChecked] = useState(false);
  const [prefIndex, setPrefIndex] = useState(0);

  // For GitHub: try to auto-detect username from gh auth
  useEffect(() => {
    if (provider?.id !== 'github') return;
    let cancelled = false;
    checkGhAuth().then((result) => {
      if (cancelled) return;
      setGhChecked(true);
      if (result.authenticated && result.username) {
        setGhUsername(result.username);
        // Auto-fill username if not set
        if (!config.vendorProject.username) {
          const field: SettingsField = {
            label: 'GitHub Username',
            key: 'username',
            configBag: 'vendorProject',
          };
          updateField(field, result.username);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [provider, config.vendorProject.username, updateField]);

  // Build ALL relevant fields (not just missing ones)
  const wizardFields: SettingsField[] = [];
  // Email first
  wizardFields.push({ label: 'Email', key: 'email', configBag: 'project' });
  if (provider) {
    // Auth fields (e.g. Azure PAT)
    for (const f of provider.authFields) {
      wizardFields.push({
        label: f.label,
        key: f.key,
        masked: f.masked,
        configBag: 'vendorAuth',
      });
    }
    // Project fields (owner, repo, username)
    for (const f of provider.projectFields) {
      wizardFields.push({
        label: f.label,
        key: f.key,
        configBag: 'vendorProject',
      });
    }
  }

  /** Resolve the current value of a wizard field from config */
  function fieldValue(field: SettingsField): string {
    return resolveValue(config, field);
  }

  useInput((input, key) => {
    if (step === 'welcome') {
      if (key.escape) {
        onComplete();
        return;
      }
      if (key.return) {
        setStep('fields');
        setFieldIndex(0);
        setEditing(false);
        return;
      }
      return;
    }

    if (step === 'fields') {
      if (key.escape && !editing) {
        onComplete();
        return;
      }
      if (key.escape && editing) {
        setEditing(false);
        setEditBuffer('');
        return;
      }
      if (editing) {
        if (key.return) {
          const field = wizardFields[fieldIndex]!;
          const value = editBuffer.trim() || undefined;
          if (value) {
            updateField(field, value);
          }
          setEditing(false);
          setEditBuffer('');
          return;
        }
        if (key.backspace || key.delete) {
          setEditBuffer((v) => v.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setEditBuffer((v) => v + input);
        }
        return;
      }
      // Not editing — navigate
      if (input === 'j' || key.downArrow) {
        setFieldIndex((i) => Math.min(i + 1, wizardFields.length - 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setFieldIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (key.return) {
        // On last field, advance to preferences
        if (fieldIndex === wizardFields.length - 1) {
          setStep('preferences');
          setPrefIndex(0);
          return;
        }
        setEditing(true);
        setEditBuffer(fieldValue(wizardFields[fieldIndex]!));
        return;
      }
      if (key.tab) {
        setStep('preferences');
        setPrefIndex(0);
        return;
      }
      return;
    }

    if (step === 'preferences') {
      if (key.escape) {
        onComplete();
        return;
      }
      if (input === 'j' || key.downArrow) {
        setPrefIndex((i) => Math.min(i + 1, PREF_ITEMS.length - 1));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setPrefIndex((i) => Math.max(i - 1, 0));
        return;
      }
      // Toggle with Enter, left, or right
      if (key.return || key.leftArrow || key.rightArrow) {
        const pref = PREF_ITEMS[prefIndex]!;
        const currentValue = resolveValue(config, pref.field) || 'false';
        const toggled = currentValue === 'true' ? 'false' : 'true';
        updateField(pref.field, toggled);
        // On last item, Enter advances to done
        if (key.return && prefIndex === PREF_ITEMS.length - 1) {
          setStep('done');
          return;
        }
        return;
      }
      if (key.tab) {
        setStep('done');
        return;
      }
      return;
    }

    if (step === 'done') {
      if (key.return || key.escape) {
        onComplete();
        return;
      }
      return;
    }
  });

  if (!provider) return null;

  const org = config.vendorProject.org || config.vendorProject.owner;
  const project = config.vendorProject.project || config.vendorProject.repo;

  if (step === 'welcome') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="cyan">
          Welcome to Kirby
        </Text>
        <Text> </Text>
        <Text>
          Detected{' '}
          <Text bold color="magenta">
            {provider.displayName}
          </Text>{' '}
          project
        </Text>
        {org ? <Text dimColor> Organization/Owner: {org}</Text> : null}
        {project ? <Text dimColor> Project/Repository: {project}</Text> : null}
        <Text> </Text>
        <Text>Let's review your settings.</Text>
        <Text> </Text>
        <Text dimColor>Enter to continue · Esc to skip</Text>
      </Box>
    );
  }

  if (step === 'fields') {
    const currentField = wizardFields[fieldIndex]!;
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="cyan">
          Setup — {provider.displayName}
        </Text>
        <Text dimColor>{'─'.repeat(40)}</Text>
        <Text> </Text>
        {provider.id === 'azure-devops' && currentField.key === 'pat' ? (
          <>
            <Text>Create a Personal Access Token at:</Text>
            <Text color="blue">
              https://dev.azure.com/{config.vendorProject.org || '{org}'}
              /_usersSettings/tokens
            </Text>
            <Text dimColor>
              Required scopes: Code (Read), Work Items (Read)
            </Text>
            <Text> </Text>
          </>
        ) : null}
        {provider.id === 'github' && currentField.key === 'username' ? (
          <>
            {ghChecked && ghUsername ? (
              <Text>
                Detected GitHub user:{' '}
                <Text bold color="green">
                  {ghUsername}
                </Text>
              </Text>
            ) : ghChecked ? (
              <>
                <Text dimColor>
                  Not logged in via gh CLI. Run{' '}
                  <Text color="cyan">gh auth login</Text> for automatic
                  detection.
                </Text>
              </>
            ) : (
              <Text dimColor>Checking gh auth status...</Text>
            )}
            <Text> </Text>
          </>
        ) : null}
        {wizardFields.map((field, i) => {
          const isCurrent = i === fieldIndex;
          const value = fieldValue(field);
          return (
            <Text key={field.key}>
              <Text color={isCurrent ? 'cyan' : undefined}>
                {isCurrent ? '› ' : '  '}
              </Text>
              <Text bold={isCurrent}>{field.label}: </Text>
              {isCurrent && editing ? (
                <Text color="cyan">
                  {field.masked ? '*'.repeat(editBuffer.length) : editBuffer}
                  <Text dimColor>_</Text>
                </Text>
              ) : value ? (
                <Text color="green">{field.masked ? '****' : value}</Text>
              ) : (
                <Text dimColor>(not set)</Text>
              )}
            </Text>
          );
        })}
        <Text> </Text>
        <Text dimColor>
          {editing
            ? 'Type value · Enter to save · Esc to cancel'
            : 'j/k nav · Enter edit · Tab next step · Esc skip'}
        </Text>
      </Box>
    );
  }

  if (step === 'preferences') {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold color="cyan">
          Preferences
        </Text>
        <Text dimColor>{'─'.repeat(40)}</Text>
        <Text> </Text>
        {PREF_ITEMS.map((pref, i) => {
          const isCurrent = i === prefIndex;
          const value = resolveValue(config, pref.field);
          const isOn = value === 'true';
          return (
            <Box key={pref.field.key} flexDirection="column">
              <Text>
                <Text color={isCurrent ? 'cyan' : undefined}>
                  {isCurrent ? '› ' : '  '}
                </Text>
                <Text bold={isCurrent}>{pref.field.label}: </Text>
                <Text color={isOn ? 'green' : undefined}>
                  {isOn ? 'On' : 'Off'}
                </Text>
              </Text>
              {isCurrent ? <Text dimColor> {pref.description}</Text> : null}
            </Box>
          );
        })}
        <Text> </Text>
        <Text dimColor>
          j/k nav · Enter or ←/→ toggle · Tab next step · Esc skip
        </Text>
      </Box>
    );
  }

  // step === 'done'
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold color="green">
        Setup Complete
      </Text>
      <Text> </Text>
      <Text>
        {provider.displayName} is configured. You can change settings anytime
        with <Text color="cyan">s</Text>.
      </Text>
      <Text> </Text>
      <Text dimColor>Enter to start</Text>
    </Box>
  );
}
