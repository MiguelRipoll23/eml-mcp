import { z } from 'zod';

const WorkflowConditionsSchema = z.object({
  operator: z.literal('OR'),
  fields: z.array(z.enum(['subject', 'body'])).default(['subject', 'body']),
  keywords: z.array(z.string()).min(1),
});

export const WorkflowConfigSchema = z.object({
  name: z.string(),
  conditions: WorkflowConditionsSchema,
  command: z.string(),
  workingDirectory: z.string().optional(),
  preambleExtra: z.string().optional(),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

export type LoadedWorkflowConfig = WorkflowConfig & { sourceFile: string };

export interface LogEntry {
  time: string;
  message: string;
  kind: 'info' | 'refresh' | 'error' | 'found' | 'workflow';
}

export interface RefreshResult {
  added: number;
  removed: number;
  updated: number;
}

export interface WorkflowRunStats {
  lastRunAt: string | null;
  runCount: number;
}
