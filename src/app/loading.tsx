import { DotsLoader } from "@/components/loaders";


export default function Loading() {
  return (
    <main className="page max-w-2xl" aria-busy="true">
      <div className="flex flex-col items-center py-4">
        <DotsLoader />
        <p className="made-by"><strong>KlokIt</strong></p>
      </div>
      <div className="skeleton mt-2 h-8 w-2/3" />
      <div className="skeleton mt-3 h-4 w-1/2" />
      <div className="neu-card mt-6 flex flex-col gap-4">
        <div className="skeleton h-5 w-1/3" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-14 w-full" />
      </div>
    </main>
  );
}