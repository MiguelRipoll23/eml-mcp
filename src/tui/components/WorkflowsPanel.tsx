import React from 'react';
import { Box, Text } from 'ink';
import type { LoadedWorkflowConfig, WorkflowRunStats } from '../types/workflow.types.js';

const BLUE  = '#89B4FA';
const GREEN = '#A6E3A1';

interface WorkflowsPanelProps {
  workflows: LoadedWorkflowConfig[];
  errors: string[];
  workflowStats: Map<string, WorkflowRunStats>;
  width?: number;
}

export function WorkflowsPanel({ workflows, errors, workflowStats, width }: WorkflowsPanelProps) {
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
          <Box key={wf.name} flexDirection="column" marginTop={0}>
            <Box gap={1}>
              <Text color={BLUE}>-</Text>
              <Text bold color="white">{wf.name}</Text>
            </Box>
            <Box gap={1} paddingLeft={2}>
              <Text color="gray">conditions:</Text>
              <Text color={GREEN} wrap="truncate-end">{wf.conditions.keywords.join(', ')}</Text>
            </Box>
            <Box gap={1} paddingLeft={2}>
              <Text color="gray">last run:</Text>
              {runStats ? (
                <Text color="white">{runStats.lastRunAt}</Text>
              ) : (
                <Text color="gray">never</Text>
              )}
              {runStats && (
                <Text color={GREEN}>{runStats.runCount}x</Text>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
