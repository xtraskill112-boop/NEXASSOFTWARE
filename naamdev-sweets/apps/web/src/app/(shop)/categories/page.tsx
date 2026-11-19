import type { Metadata } from "next";
import { CategoriesView } from "./view";

export const metadata: Metadata = { title: "All categories", description: "Browse Indian sweets, Bengali sweets, kaju sweets, laddu, barfi, namkeen, cakes and gift hampers." };

export default function CategoriesPage() {
  return <CategoriesView />;
}
