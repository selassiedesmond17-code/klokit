import Brand from "@/components/brand";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="page flex min-h-screen max-w-md flex-col justify-center gap-5">
      <div className="flex justify-center">
        <Brand size="lg" />
      </div>
      <div className="neu-card flex flex-col gap-3 text-center">
        <h1 className="text-xl font-semibold">You are offline</h1>
        <p className="muted text-sm">
          KlokIt needs an internet connection to clock you in or out and to show
          your attendance. Check your connection, then try again.
        </p>
        <a href="/" className="neu-btn neu-btn-primary">
          Try again
        </a>
      </div>
    </main>
  );
}