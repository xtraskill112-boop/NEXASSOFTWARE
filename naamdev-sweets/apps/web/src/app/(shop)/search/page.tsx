import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandLoader } from "@naamdev/ui";
import { SearchExperience } from "@/components/product/search-experience";

export const metadata: Metadata = { title: "Search sweets", robots: { index: false } };

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6">
      <Suspense fallback={<BrandLoader className="py-20" />}>
        <SearchExperience />
      </Suspense>
    </div>
  );
}
