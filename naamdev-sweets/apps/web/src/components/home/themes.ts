/** Flat background + text colour per banner theme (chosen in the console). */
export const THEME_BG: Record<string, string> = {
  saffron: "bg-[#F6E3CC] text-[#4A2508]",
  maroon: "bg-maroon-800 text-cream-100",
  royal: "bg-[#3A0F1A] text-cream-100",
  pistachio: "bg-[#E3EBD3] text-[#2F4417]",
  rose: "bg-[#F5E1DE] text-maroon-900",
  midnight: "bg-[#262030] text-cream-100",
  gold: "bg-[#F4E6BE] text-maroon-900",
};
export const themeBg = (t: string) => THEME_BG[t] ?? THEME_BG.saffron;
