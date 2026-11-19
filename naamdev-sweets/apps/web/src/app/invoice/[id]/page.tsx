import Client from "./client";

// Exported once as a placeholder; Firebase Hosting serves it for every matching address
// (firebase.json rewrites) and the page reads the real id from the address bar.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <Client />;
}
