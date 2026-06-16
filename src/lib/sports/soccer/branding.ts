// Soccer team identity. ESPN serves national-team crests by lowercased
// abbreviation; we fall back to that when an event payload omits the logo.
export function countryCrestUrl(abbreviation: string): string | null {
  const abbr = abbreviation?.trim().toLowerCase();
  if (!abbr) return null;
  return `https://a.espncdn.com/i/teamlogos/countries/500/${abbr}.png`;
}
