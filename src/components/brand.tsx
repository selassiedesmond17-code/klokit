import Image from "next/image";

// showName={false} gives the logo on its own
export default function Brand({
  size = "md",
  showName = true,
}: {
  size?: "md" | "lg";
  showName?: boolean;
}) {
  const px = size === "lg" ? 64 : 38;
  return (
    <div className="brand">
      <span className="brand-logo" style={{ width: px, height: px }}>
        <Image
          src="/logo-light.png"
          alt="KlokIt"
          width={px}
          height={px}
          className="logo-light"
          unoptimized
          priority
        />
        <Image
          src="/logo-dark.png"
          alt=""
          width={px}
          height={px}
          className="logo-dark"
          unoptimized
          priority
        />
      </span>
      {showName && (
        <span className={`brand-name${size === "lg" ? " brand-name-lg" : ""}`}>
          Klok<span className="brand-accent">It</span>
        </span>
      )}
    </div>
  );
}