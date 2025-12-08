import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fuzzy search that matches if all characters in the query appear in order in the text.
 * Also matches substring searches (traditional includes).
 *
 * Examples:
 * - fuzzyMatch("Sport", "sp") -> true (substring)
 * - fuzzyMatch("Sport", "spt") -> true (s...p...t in order)
 * - fuzzyMatch("Mathematics", "math") -> true (substring)
 * - fuzzyMatch("Physical Education", "pe") -> true (P...E in order)
 *
 * @param text The text to search in
 * @param query The search query
 * @returns true if the query fuzzy-matches the text
 */
export function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // First try exact substring match
  if (textLower.includes(queryLower)) {
    return true;
  }

  // Then try fuzzy matching (characters in order)
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === queryLower.length;
}
