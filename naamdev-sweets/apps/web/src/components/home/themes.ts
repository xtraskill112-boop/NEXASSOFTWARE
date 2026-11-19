export const THEME_BG: Record<string, string> = {
  saffron: "bg-[radial-gradient(120%_120%_at_0%_0%,#FFB65E_0%,#F57F0E_45%,#B24C08_100%)] text-white",
  maroon: "bg-[radial-gradient(120%_120%_at_100%_0%,#B22A42_0%,#6E1528_50%,#2E0711_100%)] text-cream-100",
  royal: "bg-[radial-gradient(120%_130%_at_100%_10%,#8F1D34_0%,#3A0A16_55%,#170307_100%)] text-cream-100",
  pistachio: "bg-[radial-gradient(120%_120%_at_0%_0%,#B5D58A_0%,#6F9A3A_50%,#3E5F1D_100%)] text-white",
  rose: "bg-[radial-gradient(120%_120%_at_0%_0%,#F9C8D0_0%,#E17080_45%,#8F1D34_100%)] text-white",
  midnight: "bg-[radial-gradient(120%_120%_at_100%_0%,#4B1D52_0%,#22102E_55%,#0E0715_100%)] text-cream-100",
  gold: "bg-[radial-gradient(120%_120%_at_0%_0%,#FFF1C9_0%,#F3D27A_45%,#D4A72C_100%)] text-maroon-900",
};
export const themeBg = (t: string) => THEME_BG[t] ?? THEME_BG.saffron;
