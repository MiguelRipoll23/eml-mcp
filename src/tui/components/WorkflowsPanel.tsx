import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { LoadedWorkflowConfig, WorkflowRunStats } from '../types/workflow.types.js';
import { toRelative } from '../utils/relative-time.js';
import { WorkflowRunDialog } from './WorkflowRunDialog.js';

const BLUE  = '#89B4FA';
const GREEN = '#A6E3A1';
const PINK  = '#F38BA8';

// Rows consumed by the Dashboard chrome above this panel (tab bar + marginTop)
const DASHBOARD_OVERHEAD = 2;

function isDefaultFields(fields: string[]): boolean {
  return fields.length === 2 && fields.includes('subject') && fields.includes('body');
}

function cardRows(wf: LoadedWorkflowConfig, isFirst: boolean): number {
  return (isFirst ? 0 : 1)                                      // gap between cards
    + 1                                                          // name
    + 1                                                          // "keywords:" label
    + 1                                                          // keywords value
    + (!isDefaultFields(wf.conditions.fields) ? 2 : 0)          // optional fields (label + value)
    + (wf.disallowedWords?.length ? 2 : 0)                      // optional disallowed words (label + value)
    + 1                                                          // "command:" label
    + 1                                                          // command value
    + (wf.workingDirectory ? 2 : 0)                             // optional working directory (label + value)
    + (wf.preambleExtra ? 2 : 0)                                // optional prompt (label + value)
    + 1                                                          // "last run:" label
    + 1;                                                         // last run value
}

function computeVisibleCount(
  workflows: LoadedWorkflowConfig[],
  offset: number,
  slotRows: number,
): number {
  let used = 0;
  let count = 0;
  for (let i = 0; i < workflows.length - offset; i++) {
    const h = cardRows(workflows[offset + i], i === 0);
    if (used + h > slotRows) break;
    used += h;
    count++;
  }
  return count;
}

interface WorkflowsPanelProps {
  workflows: LoadedWorkflowConfig[];
  errors: string[];
  workflowStats: Map<string, WorkflowRunStats>;
  width?: number;
  onRunWorkflow: (workflow: LoadedWorkflowConfig, text: string) => void;
  onOpenPromptFile: (workflow: LoadedWorkflowConfig) => void;
  onDialogOpenChange: (open: boolean) => void;
}

export function WorkflowsPanel({ workflows, errors, workflowStats, width, onRunWorkflow, onOpenPromptFile, onDialogOpenChange }: WorkflowsPanelProps) {
  const [, setTick] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { rows, columns } = useWindowSize();

  const openDialog = () => { setDialogOpen(true); onDialogOpenChange(true); };
  const closeDialog = () => { setDialogOpen(false); onDialogOpenChange(false); };

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Clamp offset when workflows list shrinks or terminal shrinks
  useEffect(() => {
    if (scrollOffset > 0 && scrollOffset >= workflows.length) {
      setScrollOffset(Math.max(0, workflows.length - 1));
    }
  }, [workflows.length, scrollOffset]);

  useEffect(() => {
    if (workflows.length === 0) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex(prev => Math.min(prev, workflows.length - 1));
  }, [workflows.length]);

  const fixedRows = DASHBOARD_OVERHEAD + errors.length + (workflows.length === 0 && errors.length === 0 ? 1 : 0);
  const availableRows = rows - fixedRows;

  // Two-pass: first compute without indicator rows, then subtract indicator rows and recompute
  const count1 = computeVisibleCount(workflows, scrollOffset, availableRows);
  const indicatorRows = (scrollOffset > 0 ? 1 : 0) + (scrollOffset + count1 < workflows.length ? 1 : 0);
  const count = indicatorRows > 0
    ? computeVisibleCount(workflows, scrollOffset, availableRows - indicatorRows)
    : count1;

  const canScrollUp   = scrollOffset > 0;
  const canScrollDown = scrollOffset + count < workflows.length;

  useInput((_input, key) => {
    if (dialogOpen) return; // dialog handles its own input
    if (key.upArrow) {
      if (selectedIndex > 0) {
        setSelectedIndex(n => n - 1);
        // scroll up if needed
        if (selectedIndex - 1 < scrollOffset) setScrollOffset(n => Math.max(0, n - 1));
      }
    }
    if (key.downArrow) {
      if (selectedIndex < workflows.length - 1) {
        setSelectedIndex(n => n + 1);
        // scroll down if needed
        if (selectedIndex + 1 >= scrollOffset + count) setScrollOffset(n => n + 1);
      }
    }
    if (key.return) {
      if (workflows[selectedIndex]) openDialog();
    }
    if (_input === 'p') {
      if (workflows[selectedIndex]) onOpenPromptFile(workflows[selectedIndex]);
    }
  });

  const visible = workflows.slice(scrollOffset, scrollOffset + count);

  if (dialogOpen && workflows[selectedIndex]) {
    return (
      <Box width={columns} height={rows - DASHBOARD_OVERHEAD} justifyContent="center" alignItems="center">
        <Box width={60}>
          <WorkflowRunDialog
            workflow={workflows[selectedIndex]}
            onRun={(text) => {
              closeDialog();
              onRunWorkflow(workflows[selectedIndex], text);
            }}
            onCancel={closeDialog}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" overflow="hidden" paddingLeft={1} width={width}>
      {errors.map((error, i) => (
        <Text key={i} color="red">{error}</Text>
      ))}
      {workflows.length === 0 && errors.length === 0 && (
        <Text color="gray">No workflows found</Text>
      )}
      {canScrollUp && (
        <Text color="gray">↑  {scrollOffset} more</Text>
      )}
      {visible.map((wf, idx) => {
        const absoluteIndex = scrollOffset + idx;
        const isSelected = absoluteIndex === selectedIndex;
        const runStats = workflowStats.get(wf.name);
        return (
          <Box key={wf.name} flexDirection="column" marginTop={idx === 0 ? 0 : 1}>
            <Text bold color={isSelected ? PINK : 'white'}>
              {isSelected ? '▶ ' : '  '}{wf.name}
            </Text>
            <Box flexDirection="column" paddingLeft={2}>
              <Text color={BLUE}>keywords:</Text>
              <Box paddingLeft={2}>
                <Text color={GREEN} wrap="wrap">{wf.conditions.keywords.join(', ')}</Text>
              </Box>
            </Box>
            {!isDefaultFields(wf.conditions.fields) && (
              <Box flexDirection="column" paddingLeft={2}>
                <Text color={BLUE}>fields:</Text>
                <Box paddingLeft={2}>
                  <Text color={GREEN}>{wf.conditions.fields.join(', ')}</Text>
                </Box>
              </Box>
            )}
            {wf.disallowedWords?.length && (
              <Box flexDirection="column" paddingLeft={2}>
                <Text color={BLUE}>disallowed words:</Text>
                <Box paddingLeft={2}>
                  <Text color={GREEN} wrap="wrap">{wf.disallowedWords.join(', ')}</Text>
                </Box>
              </Box>
            )}
              <Box flexDirection="column" paddingLeft={2}>
                <Text color={BLUE}>command:</Text>
                <Box paddingLeft={2}>
                  <Text color={GREEN} wrap="truncate-end">{wf.command}</Text>
                </Box>
              </Box>
              {wf.workingDirectory && (
                <Box flexDirection="column" paddingLeft={2}>
                  <Text color={BLUE}>working directory:</Text>
                  <Box paddingLeft={2}>
                    <Text color={GREEN} wrap="truncate-end">{wf.workingDirectory}</Text>
                  </Box>
                </Box>
              )}
              {wf.preambleExtra && (
                <Box flexDirection="column" paddingLeft={2}>
                  <Text color={BLUE}>preambleExtra:</Text>
                  <Box paddingLeft={2}>
                    <Text color={GREEN} wrap="truncate-end">{wf.preambleExtra}</Text>
                  </Box>
                </Box>
              )}
            <Box flexDirection="column" paddingLeft={2}>
              <Text color={BLUE}>last run:</Text>
              <Box paddingLeft={2} gap={1}>
                {runStats ? (
                  <Text color={GREEN}>{toRelative(runStats.lastRunAt)}</Text>
                ) : (
                  <Text color="gray">never</Text>
                )}
                {runStats && (
                  <Text color={GREEN}>{runStats.runCount}x</Text>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}
      {canScrollDown && (
        <Text color="gray">↓  {workflows.length - scrollOffset - count} more</Text>
      )}
    </Box>
  );
}
