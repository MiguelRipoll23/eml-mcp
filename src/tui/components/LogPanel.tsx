import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { LogEntry } from '../types/workflow.types.js';

const PINK  = '#F38BA8';
const BLUE  = '#89B4FA';
const GREEN = '#A6E3A1';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const KIND_COLOR: Record<LogEntry['kind'], string> = {
  info:     'gray',
  refresh:  BLUE,
  error:    'red',
  found:    'white',
  workflow: PINK,
};

interface LogPanelProps {
  entries: LogEntry[];
  visibleLines?: number;
  width?: number;
}

export function LogPanel({ entries, visibleLines = 12, width }: LogPanelProps) {
  const [frame, setFrame] = useState(0);
  const visible = entries.slice(-visibleLines).reverse();

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(prev => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box flexDirection="column" overflow="hidden" borderStyle="round" borderColor={PINK} paddingX={1} width={width}>
      <Text bold color={PINK}>Activity Log</Text>
      {visible.length === 0 && (
        <Box gap={1}>
          <Text color={GREEN}>{SPINNER_FRAMES[frame]}</Text>
          <Text color={GREEN}>Waiting for emails...</Text>
        </Box>
      )}
      {visible.map((entry, i) => (
        <Box key={i} gap={1}>
          <Text color="gray">{entry.time}</Text>
          <Text color={KIND_COLOR[entry.kind]} wrap="truncate-end">{entry.message}</Text>
        </Box>
      ))}
    </Box>
  );
}
