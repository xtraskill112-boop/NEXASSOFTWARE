import Client from "./client";

// Exported once as a placeholder; Firebase Hosting serves it for every /delivery/<id> address.
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <Client />;
}
