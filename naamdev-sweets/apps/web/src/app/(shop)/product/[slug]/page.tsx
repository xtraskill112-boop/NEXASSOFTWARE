import Client from "./client";

// Exported once as a placeholder; Firebase Hosting serves it for every matching address
// (firebase.json rewrites) and the page reads the real slug from the address bar.
export function generateStaticParams() {
  return [{ slug: "_" }];
}

export default function Page() {
  return <Client />;
}
