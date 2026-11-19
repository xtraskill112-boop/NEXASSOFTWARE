import type { Metadata } from "next";
import { ContactView } from "./view";

export const metadata: Metadata = { title: "Contact us", description: "Reach NAAMDEV SWEETS for orders, bulk gifting and support." };

export default function ContactPage() {
  return <ContactView />;
}
