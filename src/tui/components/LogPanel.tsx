import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { LogEntry } from '../types/workflow.types.js';

const PINK  = '#F38BA8';
const BLUE  = '#89B4FA';
const GREEN = '#A6E3A1';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Rows consumed by the Dashboard chrome above this panel (tab bar + marginTop)
const DASHBOARD_OVERHEAD = 2;

const KIND_COLOR: Record<LogEntry['kind'], string> = {
  info:     'gray',
  refresh:  BLUE,
  error:    'red',
  found:    'white',
  workflow: PINK,
};

interface LogPanelProps {
  entries: LogEntry[];
  width?: number;
}

export function LogPanel({ entries, width }: LogPanelProps) {
  const [frame, setFrame] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const { rows } = useWindowSize();

  const reversed = [...entries].reverse(); // newest first, oldest last
  const totalCount = reversed.length;

  // Clamp offset when log shrinks
  useEffect(() => {
    if (scrollOffset > 0 && scrollOffset >= totalCount) {
      setScrollOffset(Math.max(0, totalCount - 1));
    }
  }, [totalCount, scrollOffset]);

  const slotRows = rows - DASHBOARD_OVERHEAD;

  // Two-pass: compute indicators first, then subtract their rows
  const count1        = slotRows;
  const canScrollUp1  = scrollOffset > 0;
  const canScrollDown1 = scrollOffset + count1 < totalCount;
  const indicatorRows = (canScrollUp1 ? 1 : 0) + (canScrollDown1 ? 1 : 0);
  const visibleLines  = indicatorRows > 0 ? slotRows - indicatorRows : count1;

  const canScrollUp   = scrollOffset > 0;
  const canScrollDown = scrollOffset + visibleLines < totalCount;

  useInput((_input, key) => {
    if (key.upArrow && canScrollUp) setScrollOffset(n => n - 1);
    if (key.downArrow && canScrollDown) setScrollOffset(n => n + 1);
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(prev => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  const visible = reversed.slice(scrollOffset, scrollOffset + visibleLines);

  return (
    <Box flexDirection="column" overflow="hidden" paddingLeft={1} width={width}>
      {entries.length === 0 && (
        <Box gap={1}>
          <Text color={PINK}>{SPINNER_FRAMES[frame]}</Text>
          <Text color={PINK}>Waiting for drama...</Text>
        </Box>
      )}
      {canScrollUp && (
        <Text color="gray">↑  {scrollOffset} more</Text>
      )}
      {visible.map((entry, i) => (
        <Box key={i} gap={1}>
          <Text color="gray">{entry.time}</Text>
          <Text color={KIND_COLOR[entry.kind]} wrap="truncate-end">{entry.message}</Text>
        </Box>
      ))}
      {canScrollDown && (
        <Text color="gray">↓  {totalCount - scrollOffset - visibleLines} more</Text>
      )}
    </Box>
  );
}
