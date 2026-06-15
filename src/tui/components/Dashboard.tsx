import React, { useMemo } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Services } from '../../types/service.types.js';
import type { LoadedWorkflowConfig } from '../types/workflow.types.js';
import { ProcessedStore } from '../services/processed-store.js';
import { useIndexWatcher } from '../hooks/useIndexWatcher.js';
import { WorkflowsPanel } from './WorkflowsPanel.js';
import { LogPanel } from './LogPanel.js';
import { VERSION } from '../../constants/version.js';

interface DashboardProps {
  services: Services;
  workflows: LoadedWorkflowConfig[];
  workflowErrors: string[];
  promptsDirectory: string;
  processedStorePath: string;
}

export function Dashboard({ services, workflows, workflowErrors, promptsDirectory, processedStorePath }: DashboardProps) {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  const store = useMemo(() => {
    const s = new ProcessedStore(processedStorePath);
    s.load();
    return s;
  }, [processedStorePath]);

  const { log, workflowStats } = useIndexWatcher(
    services,
    workflows,
    store,
    promptsDirectory,
  );

  const panelWidth = Math.min(columns, 72);

  return (
    <Box flexDirection="column" width={columns} overflow="hidden">
      <Text color="gray"> eml v{VERSION}</Text>
      <WorkflowsPanel workflows={workflows} errors={workflowErrors} workflowStats={workflowStats} width={panelWidth} />
      <LogPanel entries={log} width={panelWidth} />
    </Box>
  );
}
