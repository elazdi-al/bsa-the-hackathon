/** The list idiom the tabs and their sheets share, so a section, a card and a row read the same everywhere. */

/** Grey label over a group of rows. Callers inset it so it lines up with the rows' glyphs. */
export const sectionLabel = "pb-2 text-[13px] leading-[18px] font-medium text-[#adadad]";

/** The card that groups rows: a 1px ring and a soft drop, no fill. Callers pick the radius. */
export const hairline = "shadow-[0_0_0_1px_rgb(0_0_0/0.035),0_2px_6px_rgb(0_0_0/0.02)]";

/** Press feedback of a full-width row: a faint tint under a pointer, a firmer one while pressed. */
export const rowPress = "transition-[background-color] duration-150 ease-out hover:bg-black/[0.025] active:bg-black/[0.04]";
