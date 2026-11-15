import { request, state } from '../api';

export async function unsavedWork(): Promise<boolean> {
  let current;
  try { current = state(); } catch { return false; }
  if (!current.canUndo) return false;
  try {
    const [access, saved] = await Promise.all([
      request<{ projectId: string }>('/api/access'),
      request<{ projects: { id: string }[] }>('/api/projects'),
    ]);
    return !saved.projects.some(project => project.id === access.projectId);
  } catch {
    return true;
  }
}
