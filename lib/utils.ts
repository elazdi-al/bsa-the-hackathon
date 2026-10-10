import { createCn } from "cn/config";

// "cn" reads the type scale's names (app/globals.css) as text colours, so it would drop `text-body` from
// `text-body text-muted-foreground`. Taught they are sizes, it merges them like `text-sm`.
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["display", "amount", "title", "heading", "label", "body", "caption", "section"] }] } },
});
