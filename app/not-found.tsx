import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted-foreground">That mosque or city is not in the directory.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-[12px] bg-primary px-4 font-semibold text-primary-foreground">
        Find a mosque
      </Link>
    </div>
  );
}
