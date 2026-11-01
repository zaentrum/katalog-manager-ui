// The text of a request's GraphQL errors, as the console shows it: no React,
// so `npm test` runs it under node as it is.

/** How many of a request's messages the console shows. */
export const SHOWN_ERRORS = 3;

/** errorText is the text of the messages of a request's GraphQL errors: each
 *  message once, in the order they came, the first SHOWN_ERRORS of them, and
 *  how many more there are ("…; and 4 more"). A field that failed for every
 *  item of a page answers one error an item, each with the same message. */
export function errorText(messages: readonly string[]): string {
  const unique = [...new Set(messages)];
  const shown = unique.slice(0, SHOWN_ERRORS).join('; ');
  const more = unique.length - SHOWN_ERRORS;
  return more > 0 ? `${shown}; and ${more} more` : shown;
}
