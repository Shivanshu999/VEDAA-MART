import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Page not found</p>
      <h1 className="text-3xl font-bold text-slate-900">The page you’re looking for isn’t here.</h1>
      <p className="max-w-md text-slate-600">
        It may have moved, been removed, or the link may be incorrect.
      </p>
      <Link
        href="/"
        className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90"
      >
        Back to home
      </Link>
    </div>
  );
}
