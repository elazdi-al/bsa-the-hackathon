/** The list idiom the tabs and their sheets share, so a section and a row read the same everywhere. Lists sit flat, with no card. */

/** Grey label over a group of rows. Callers inset it so it lines up with the rows' glyphs. */
export const sectionLabel = "pb-2 text-section text-muted-foreground uppercase";

/** Press feedback of a full-width row: a faint tint under a pointer, a firmer one while pressed. */
export const rowPress = "transition-[background-color] duration-150 ease-out hover:bg-black/[0.025] active:bg-black/[0.04]";
