import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useWindowSize } from 'ink';
import type { LogEntry } from '../types/workflow.types.js';

const PINK  = '#F38BA8';
const BLUE  = '#89B4FA';
const GREEN = '#A6E3A1';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// Rows consumed by the Dashboard chrome above this panel (tab bar + marginTop)
const DASHBOARD_OVERHEAD = 2;

const YELLOW = '#F9E2AF';

const KIND_COLOR: Record<LogEntry['kind'], string> = {
  info:        'gray',
  refresh:     BLUE,
  error:       'red',
  found:       'white',
  workflow:    PINK,
  keywords:    GREEN,
  skipped:     YELLOW,
  'global-skip': YELLOW,
};

interface LogPanelProps {
  entries: LogEntry[];
  width?: number;
}

export function LogPanel({ entries, width }: LogPanelProps) {
  const [frame, setFrame] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [following, setFollowing] = useState(true);
  const { rows } = useWindowSize();

  const totalCount = entries.length;
  const slotRows = rows - DASHBOARD_OVERHEAD;

  // Two-pass: compute indicators first, then subtract their rows
  const canScrollUp1   = scrollOffset > 0;
  const canScrollDown1 = scrollOffset + slotRows < totalCount;
  const indicatorRows  = (canScrollUp1 ? 1 : 0) + (canScrollDown1 ? 1 : 0);
  const visibleLines   = indicatorRows > 0 ? slotRows - indicatorRows : slotRows;

  const canScrollUp   = scrollOffset > 0;
  const canScrollDown = scrollOffset + visibleLines < totalCount;

  // Auto-follow: jump to bottom when new entries arrive
  useEffect(() => {
    if (following) {
      setScrollOffset(Math.max(0, totalCount - visibleLines));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCount]);

  useInput((_input, key) => {
    if (key.upArrow && canScrollUp) {
      setFollowing(false);
      setScrollOffset(n => n - 1);
    }
    if (key.downArrow && canScrollDown) {
      const next = scrollOffset + 1;
      setScrollOffset(next);
      if (next + visibleLines >= totalCount) setFollowing(true);
    }
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(prev => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  const visible = entries.slice(scrollOffset, scrollOffset + visibleLines);

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
        <Box key={scrollOffset + i} gap={1}>
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
