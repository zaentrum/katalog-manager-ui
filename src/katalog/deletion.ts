// Pure helpers for deleting a title: no React, no DOM, so `npm test` runs
// them under node as they are.

/** What a delete removes from disk besides the catalog entry. Both start
 *  unticked: removing the media files is irreversible. */
export interface DeleteFiles {
  files: boolean; // the media file(s)
  packages: boolean; // the packaged (HLS) files
}

/** True when the delete removes anything from disk: then the admin confirms
 *  it by typing the title. */
export function deletesFromDisk(d: DeleteFiles): boolean {
  return d.files || d.packages;
}

/** True when what was typed is the title (surrounding spaces aside). */
export function confirmsTitle(typed: string, title: string): boolean {
  return title.trim() !== '' && typed.trim() === title.trim();
}

/** What katalog-manager's deleteItem answers. */
export interface DeleteResult {
  deleted: boolean;
  itemsRemoved: number;
  filesRemoved: number;
  packagesRemoved: number;
  errors: string[];
}

/** What the list says after a delete: the title, what went, and the errors
 *  the delete met, which stay until dismissed. */
export interface DeletionNotice {
  title: string;
  summary: string;
  errors: string[];
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The notice of a delete of title, with what was asked of it. */
export function deletionNotice(title: string, asked: DeleteFiles, r: DeleteResult): DeletionNotice {
  const removed = [`${count(r.itemsRemoved, 'item', 'items')} from the catalog`];
  if (asked.files) removed.push(`${count(r.filesRemoved, 'media file', 'media files')} from disk`);
  if (asked.packages) removed.push(`${count(r.packagesRemoved, 'package', 'packages')} from disk`);
  let summary = `removed ${removed.join(', ')}`;
  if (!deletesFromDisk(asked)) summary += '; its files are left on disk, and the next scan imports them again';
  return { title, summary, errors: r.errors ?? [] };
}

/** The notice the item page hands the list in the router state; null for
 *  any other state. */
export function noticeFrom(state: unknown): DeletionNotice | null {
  if (!state || typeof state !== 'object') return null;
  const n = (state as { deleted?: unknown }).deleted;
  if (!n || typeof n !== 'object') return null;
  const { title, summary, errors } = n as { title?: unknown; summary?: unknown; errors?: unknown };
  if (typeof title !== 'string' || typeof summary !== 'string' || !Array.isArray(errors)) return null;
  return { title, summary, errors: errors.filter((e): e is string => typeof e === 'string') };
}
