import { describe, expect, it } from 'vitest';
import { upsertProject } from '../projectState';

describe('upsertProject', () => {
  it('adds a project that is not present', () => {
    expect(upsertProject([], { id: 'project-1', name: 'One' })).toEqual([
      { id: 'project-1', name: 'One' },
    ]);
  });

  it('merges a project already received from the backend broadcast', () => {
    const projects = [{ id: 'project-1', name: 'One', status: 'running', pid: 42 }];
    const result = upsertProject(projects, { id: 'project-1', name: 'One updated' });

    expect(result).toEqual([
      { id: 'project-1', name: 'One updated', status: 'running', pid: 42 },
    ]);
  });
});
