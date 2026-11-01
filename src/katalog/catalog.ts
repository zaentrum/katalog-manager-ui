// Pure helpers for the catalog's list: no React, no DOM, so `npm test` runs
// them under node as they are.

/** The list's query, with what each item has on disk (katalog-manager's
 *  Item.hasOriginal, originalBytes and packageBytes, read for the page at
 *  once) and the has-original filter (items' hasOriginal). */
export const LIST_Q = `query Catalog($type: String, $genre: String, $year: Int, $search: String, $hasOriginal: Boolean) {
  items(type: $type, genre: $genre, year: $year, search: $search, hasOriginal: $hasOriginal, limit: 200) {
    id type title year posterUrl isPackaged overallStatus { overallStatus } hasOriginal originalBytes packageBytes
  }
}`;

/** The list's query without them, as a katalog-manager older than them
 *  takes it. */
export const LIST_Q_UNSIZED = `query Catalog($type: String, $genre: String, $year: Int, $search: String) {
  items(type: $type, genre: $genre, year: $year, search: $search, limit: 200) {
    id type title year posterUrl isPackaged overallStatus { overallStatus }
  }
}`;

/** True when katalog-manager does not know what an item has on disk: an
 *  older one answers that the fields, or the filter, are none (graph-gophers'
 *  validation errors), and the list is read without them. */
export function withoutSizes(error: string | null | undefined): boolean {
  if (!error) return false;
  return (
    /Cannot query field "(hasOriginal|originalBytes|packageBytes)" on type "Item"/.test(error) ||
    /Unknown argument "hasOriginal" on field "Query\.items"/.test(error)
  );
}

/** The has-original filter: every item, those with an original on disk,
 *  those with none. */
export const HAS_ORIGINAL_OPTIONS: { label: string; value: string }[] = [
  { label: 'all', value: '' },
  { label: 'yes', value: 'yes' },
  { label: 'no', value: 'no' },
];

/** What a choice of the has-original filter asks katalog-manager: null keeps
 *  every item. */
export function hasOriginalVar(choice: string): boolean | null {
  if (choice === 'yes') return true;
  if (choice === 'no') return false;
  return null;
}

/** The list's filters as the bar holds them. */
export interface CatalogFilter {
  search: string;
  type: string;
  genre: string;
  year: string;
  hasOriginal: string;
}

/** The list's variables: a filter left empty is null, and keeps every item;
 *  the has-original filter is asked only of a katalog-manager that has it
 *  (sized), as LIST_Q_UNSIZED declares no such variable. */
export function listVariables(f: CatalogFilter, sized: boolean): Record<string, unknown> {
  const vars: Record<string, unknown> = {
    search: f.search || null,
    type: f.type || null,
    genre: f.genre || null,
    year: f.year ? parseInt(f.year, 10) : null,
  };
  if (sized) vars.hasOriginal = hasOriginalVar(f.hasOriginal);
  return vars;
}
