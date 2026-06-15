import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { LoadedWorkflowConfig } from '../types/workflow.types.js';

const BLUE = '#89B4FA';
const YELLOW = '#F9E2AF';

interface WorkflowRunDialogProps {
  workflow: LoadedWorkflowConfig;
  onRun: (text: string) => void;
  onCancel: () => void;
}

export function WorkflowRunDialog({ workflow, onRun, onCancel }: WorkflowRunDialogProps) {
  const [text, setText] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
    // Ctrl+Enter: some terminals send ctrl+m for Ctrl+Enter. This is best-effort —
    // plain Enter via onSubmit below is the primary reliable trigger.
    if (key.ctrl && input === 'm') {
      onRun(text);
    }
  });

  return (
    <Box flexDirection="column" gap={1} width={60}>
      <Box flexDirection="column">
        <Text color={YELLOW}>Run {workflow.name}?</Text>
        <Box borderStyle="round" borderColor={BLUE} paddingX={1} width={60}>
          <TextInput
            value={text}
            onChange={setText}
            onSubmit={onRun}
            placeholder="Enter context here..."
          />
        </Box>
      </Box>
      <Text color="gray">[enter] run  [esc] cancel</Text>
    </Box>
  );
}
