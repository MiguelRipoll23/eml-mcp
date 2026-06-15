import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { LoadedWorkflowConfig, WorkflowRunStats } from '../types/workflow.types.js';
import { toRelative } from '../utils/relative-time.js';

const BLUE  = '#89B4FA';
const GREEN = '#A6E3A1';

interface WorkflowNamesPanelProps {
  workflows: LoadedWorkflowConfig[];
  errors: string[];
  workflowStats: Map<string, WorkflowRunStats>;
  width?: number;
}

export function WorkflowNamesPanel({ workflows, errors, workflowStats, width }: WorkflowNamesPanelProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <Box flexDirection="column" overflow="hidden" borderStyle="round" borderColor={BLUE} paddingX={1} width={width}>
      <Text bold color={BLUE}>Workflows</Text>
      {errors.map((error, i) => (
        <Text key={i} color="red">{error}</Text>
      ))}
      {workflows.length === 0 && errors.length === 0 && (
        <Text color="gray">No workflows found</Text>
      )}
      {workflows.map(wf => {
        const runStats = workflowStats.get(wf.name);
        return (
          <Box key={wf.name} gap={1}>
            <Text bold color="white">{wf.name}</Text>
            {runStats ? (
              <Text color={GREEN}>{toRelative(runStats.lastRunAt)}</Text>
            ) : (
              <Text color="gray">never</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
