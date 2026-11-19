import type { Metadata } from "next";
import { OffersView } from "./view";

export const metadata: Metadata = { title: "Offers & coupons", description: "Latest coupons, festive discounts and sweets on offer at NAAMDEV SWEETS." };

export default function OffersPage() {
  return <OffersView />;
}
