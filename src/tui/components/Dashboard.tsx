import React, { useCallback, useState } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { Services } from '../../types/service.types.js';
import type { LoadedWorkflowConfig } from '../types/workflow.types.js';
import { useIndexWatcher } from '../hooks/useIndexWatcher.js';
import { openWorkflowPromptFile } from '../services/workflow-runner.js';
import { WorkflowsPanel } from './WorkflowsPanel.js';
import { LogPanel } from './LogPanel.js';
import { VERSION } from '../../constants/version.js';

type ActiveView = 'log' | 'workflows';

const VIEWS: ActiveView[] = ['log', 'workflows'];
const BLUE = '#89B4FA';
const PINK = '#F38BA8';

const VIEW_COLOR: Record<ActiveView, string> = {
  log:       PINK,
  workflows: BLUE,
};

interface DashboardProps {
  services: Services;
  workflows: LoadedWorkflowConfig[];
  workflowErrors: string[];
  promptsDirectory: string;
}

export function Dashboard({ services, workflows, workflowErrors, promptsDirectory }: DashboardProps) {
  const { columns } = useWindowSize();

  const [activeView, setActiveView] = useState<ActiveView>('log');
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);

  useInput((_input, key) => {
    if (workflowDialogOpen) return; // dialog captures input; don't switch tabs
    if (key.tab || key.leftArrow) {
      setActiveView(prev => {
        const idx = VIEWS.indexOf(prev);
        return VIEWS[(idx + 1) % VIEWS.length];
      });
    }
    if (key.rightArrow) {
      setActiveView(prev => {
        const idx = VIEWS.indexOf(prev);
        return VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length];
      });
    }
  });

  const openPromptFile = useCallback((workflow: LoadedWorkflowConfig) => {
    openWorkflowPromptFile(workflow, promptsDirectory);
  }, [promptsDirectory]);

  const { log, workflowStats, runManual } = useIndexWatcher(
    services,
    workflows,
    promptsDirectory,
  );

  const panelWidth = Math.min(columns, 72);

  return (
    <Box flexDirection="column" width={columns} overflow="hidden">
      <Box gap={2}>
        <Text color="gray"> eml v{VERSION}</Text>
        {VIEWS.map(view => (
          <Text key={view} bold={activeView === view} color={activeView === view ? VIEW_COLOR[view] : 'gray'}>
            {view}
          </Text>
        ))}
      </Box>

      <Box marginTop={1}>
        {activeView === 'log' && (
          <LogPanel entries={log} width={panelWidth} />
        )}

        {activeView === 'workflows' && (
          <WorkflowsPanel
            workflows={workflows}
            errors={workflowErrors}
            workflowStats={workflowStats}
            width={panelWidth}
            onRunWorkflow={runManual}
            onOpenPromptFile={openPromptFile}
            onDialogOpenChange={setWorkflowDialogOpen}
          />
        )}
      </Box>
    </Box>
  );
}
