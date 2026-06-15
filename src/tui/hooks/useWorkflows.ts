import { useState, useEffect } from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { WorkflowConfigSchema, type WorkflowConfig } from '../types/workflow.types.js';

export interface WorkflowsState {
  workflows: WorkflowConfig[];
  errors: string[];
}

export function useWorkflows(workflowsDirectory: string): WorkflowsState {
  const [state, setState] = useState<WorkflowsState>({ workflows: [], errors: [] });

  useEffect(() => {
    const workflows: WorkflowConfig[] = [];
    const errors: string[] = [];

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(workflowsDirectory, { withFileTypes: true });
    } catch {
      errors.push(`Cannot read workflows directory: ${workflowsDirectory}`);
      setState({ workflows, errors });
      return;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const filePath = path.join(workflowsDirectory, entry.name);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = WorkflowConfigSchema.parse(JSON.parse(raw));
        workflows.push(parsed);
      } catch (error) {
        errors.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    workflows.sort((a, b) => a.name.localeCompare(b.name));
    setState({ workflows, errors });
  }, [workflowsDirectory]);

  return state;
}
