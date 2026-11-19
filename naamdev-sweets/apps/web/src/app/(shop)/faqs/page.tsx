import type { Metadata } from "next";
import { FaqsView } from "./view";

export const metadata: Metadata = { title: "Frequently asked questions", description: "Answers about orders, delivery, payments, freshness and Mithaas rewards." };

export default function FaqsPage() {
  return <FaqsView />;
}
