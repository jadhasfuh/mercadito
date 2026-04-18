"use client";

import Link from "next/link";
// eslint-disable-next-line @next/next/no-img-element
export default function Header({ title = "Mercadito" }: { title?: string }) {
  return (
    <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Mercadito" className="h-9 w-9 rounded-lg" />
          <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        </Link>
      </div>
    </header>
  );
}
