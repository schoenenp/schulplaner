import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-pirrot-blue-800 to-pirrot-blue-950 text-pirrot-blue-50">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
        <Link
          href={"/api/auth/signin"}
          className="rounded-full bg-pirrot-blue-50/10 px-10 py-3 font-semibold no-underline transition hover:bg-pirrot-blue-50/20"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
