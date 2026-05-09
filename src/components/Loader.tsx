"use client";

type Props = {
  texto?: string;
  fullScreen?: boolean;
  tamano?: "sm" | "md" | "lg";
};

const TAMANOS = {
  sm: { logo: 48, moto: 32, ancho: 180 },
  md: { logo: 72, moto: 44, ancho: 240 },
  lg: { logo: 96, moto: 56, ancho: 280 },
};

export default function Loader({ texto = "Cargando", fullScreen = false, tamano = "md" }: Props) {
  const { logo, moto, ancho } = TAMANOS[tamano];
  const wrapper = fullScreen
    ? "min-h-screen w-full flex items-center justify-center bg-cream"
    : "w-full flex items-center justify-center py-12";

  return (
    <div className={wrapper}>
      <style>{`
        @keyframes mercadito-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 4px 12px rgba(242,140,40,0.25)); }
          50% { transform: scale(1.05); filter: drop-shadow(0 8px 18px rgba(242,140,40,0.4)); }
        }
        @keyframes mercadito-moto {
          0% { transform: translateX(0) rotate(-3deg); }
          50% { transform: translateX(var(--moto-dist)) rotate(2deg); }
          100% { transform: translateX(0) rotate(-3deg); }
        }
        @keyframes mercadito-moto-bounce {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-2px); }
          75% { transform: translateY(-3px); }
        }
        @keyframes mercadito-road {
          0% { background-position: 0 0; }
          100% { background-position: -24px 0; }
        }
      `}</style>
      <div className="flex flex-col items-center gap-4">
        <img
          src="/icon-192.png"
          alt="Mercadito"
          className="rounded-2xl"
          style={{
            width: logo,
            height: logo,
            animation: "mercadito-pulse 1.6s ease-in-out infinite",
          }}
        />
        <div
          className="relative"
          style={{ width: ancho, height: moto + 16, "--moto-dist": `${ancho - moto - 8}px` } as React.CSSProperties}
        >
          <div
            className="absolute left-0 right-0"
            style={{
              bottom: 4,
              height: 3,
              borderRadius: 2,
              backgroundImage: "linear-gradient(90deg, rgba(146,64,14,0.35) 50%, transparent 50%)",
              backgroundSize: "16px 100%",
              animation: "mercadito-road 0.6s linear infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 4,
              animation: "mercadito-moto 2.4s ease-in-out infinite",
            }}
          >
            <div style={{ animation: "mercadito-moto-bounce 0.4s ease-in-out infinite" }}>
              <span style={{ fontSize: moto, lineHeight: 1, display: "inline-block" }}>🛵</span>
            </div>
          </div>
        </div>
        {texto && <p className="text-sm font-medium text-navy/70">{texto}</p>}
      </div>
    </div>
  );
}
