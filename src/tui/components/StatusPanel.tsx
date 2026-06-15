import React from 'react';
import { Box, Text } from 'ink';
import type { IndexStats } from '../../types/index.types.js';

const BLUE  = '#89B4FA';
const GREEN = '#A6E3A1';

interface StatusPanelProps {
  stats: IndexStats | null;
  isRefreshing: boolean;
}

export function StatusPanel({ stats, isRefreshing }: StatusPanelProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={BLUE} paddingX={1}>
      <Box gap={2}>
        <Text bold color={BLUE}>Email Agent</Text>
        {isRefreshing && <Text color={GREEN}>syncing</Text>}
      </Box>
      {stats && (
        <Box gap={3}>
          <Text color="white">inbox <Text bold color="white">{stats.byFolder.inbox}</Text></Text>
          <Text color="white">outbox <Text bold color="white">{stats.byFolder.outbox}</Text></Text>
          <Text color="white">drafts <Text bold color="white">{stats.byFolder.drafts}</Text></Text>
        </Box>
      )}
    </Box>
  );
}
