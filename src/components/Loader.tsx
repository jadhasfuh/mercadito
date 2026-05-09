"use client";

type Props = {
  texto?: string;
  fullScreen?: boolean;
  tamano?: "sm" | "md" | "lg";
};

const TAMANOS = {
  sm: { logo: 48, dot: 6 },
  md: { logo: 72, dot: 8 },
  lg: { logo: 96, dot: 10 },
};

export default function Loader({ texto = "Cargando", fullScreen = false, tamano = "md" }: Props) {
  const { logo, dot } = TAMANOS[tamano];
  const wrapper = fullScreen
    ? "min-h-screen w-full flex items-center justify-center bg-cream"
    : "w-full flex items-center justify-center py-12";

  return (
    <div className={wrapper}>
      <style>{`
        @keyframes mercadito-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
          30% { transform: translateY(-10px); opacity: 1; }
        }
        @keyframes mercadito-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 4px 12px rgba(242,140,40,0.25)); }
          50% { transform: scale(1.06); filter: drop-shadow(0 8px 20px rgba(242,140,40,0.45)); }
        }
        @keyframes mercadito-ring {
          0% { transform: scale(0.85); opacity: 0.7; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
      <div className="flex flex-col items-center gap-5">
        <div className="relative" style={{ width: logo, height: logo }}>
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(242,140,40,0.35) 0%, transparent 70%)",
              animation: "mercadito-ring 1.6s ease-out infinite",
            }}
          />
          <img
            src="/icon-192.png"
            alt="Mercadito"
            className="relative rounded-2xl"
            style={{
              width: logo,
              height: logo,
              animation: "mercadito-pulse 1.6s ease-in-out infinite",
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="rounded-full bg-brand"
              style={{
                width: dot,
                height: dot,
                animation: `mercadito-bounce 1s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>
        {texto && <p className="text-sm font-medium text-navy/70">{texto}</p>}
      </div>
    </div>
  );
}
