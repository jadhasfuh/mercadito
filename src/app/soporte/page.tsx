import Header from "@/components/Header";

export const metadata = {
  title: "Soporte — Mercadito",
  description:
    "¿Necesitas ayuda con un pedido o tu cuenta de Mercadito? Escríbenos por WhatsApp o correo.",
};

export default function SoportePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Mercadito" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Soporte</h1>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-6 text-sm text-gray-600 leading-relaxed">
          <section>
            <p>
              ¿Algún problema con un pedido, tu cuenta o la app? Estamos para ayudarte.
              Respondemos de 8:00 AM a 10:00 PM (hora del centro de México).
            </p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-3">WhatsApp</h2>
            <a
              href="https://wa.me/523531522293"
              className="inline-block bg-green-600 text-white px-5 py-3 rounded-lg font-medium hover:bg-green-700 transition"
            >
              +52 353 152 2293
            </a>
            <p className="mt-2 text-xs text-gray-500">
              La vía más rápida. Mándanos foto del pedido o describe tu problema.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-3">Correo</h2>
            <a
              href="mailto:adriancar75@hotmail.com"
              className="inline-block bg-orange-500 text-white px-5 py-3 rounded-lg font-medium hover:bg-orange-600 transition"
            >
              adriancar75@hotmail.com
            </a>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Antes de escribir</h2>
            <p className="mb-2">Si es sobre un pedido, ten a mano:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Tu número de teléfono registrado en Mercadito.</li>
              <li>El número de pedido (si lo tienes).</li>
              <li>La fecha y hora aproximadas del pedido.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Eliminar tu cuenta o datos</h2>
            <p>
              Puedes pedir la eliminación de tu cuenta y datos personales en{" "}
              <a href="/eliminar-datos" className="text-orange-600 underline">
                mercadito.cx/eliminar-datos
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Otras páginas</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <a href="/privacidad" className="text-orange-600 underline">
                  Política de Privacidad
                </a>
              </li>
              <li>
                <a href="/terminos" className="text-orange-600 underline">
                  Términos y Condiciones
                </a>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
