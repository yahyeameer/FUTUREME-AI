// TOMORA's brand in one place: the name, the lines we say about it, and the colours the logo and share images use.
// UI copy, metadata, the manifest, the Open Graph image and the agents' self-introductions read from here, so a
// rename never means hunting through the code again. Storage identifiers (the futureme.db file, the futureme_access
// cookie, FUTUREME_* environment variables, API routes) keep their original names on purpose: changing them would
// sign people out, orphan data or break deployments for no visible gain.

export const BRAND = {
  name: "TOMORA",
  category: "Personal Future Intelligence",
  tagline: "Tomorrow starts with you.",
  promise: "Explore the futures your choices could create.",
  description:
    "Explore the futures your choices could create. Talk with your future self, compare possible paths, and turn your ambitions into a plan you can act on.",
  /** Said wherever a generated future is shown, so the framing never drifts. */
  uncertainty: "TOMORA explores possibilities. It can't know your future, and nothing it shows is a prediction.",
  /** The AI persona the user talks with. */
  persona: "your future self",
  /** The editorial issue the night shift writes. */
  daily: "TOMORA Daily",
} as const;

/** Raw palette, for places that can't read CSS variables (the Open Graph image, the manifest, the favicon). */
export const BRAND_COLORS = {
  ink: "#101113",
  midnight: "#171B22",
  ivory: "#F3F0E8",
  champagne: "#C8B78F",
  slate: "#858A93",
} as const;
