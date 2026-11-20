import type { Metadata } from "next";
import { PhotoCreditsView } from "./view";

export const metadata: Metadata = { title: "Photo credits", description: "Credits for the photographs used in the NAAMDEV SWEETS catalogue." };

export default function PhotoCreditsPage() {
  return <PhotoCreditsView />;
}
