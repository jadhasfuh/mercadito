import Header from "@/components/Header";

export default function EliminarDatosPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Mercadito" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Eliminacion de Datos de Usuario</h1>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-6 text-sm text-gray-600 leading-relaxed">
          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Como solicitar la eliminacion de tus datos</h2>
            <p>Si deseas que eliminemos toda la informacion personal asociada a tu cuenta en Mercadito, puedes solicitarlo de las siguientes formas:</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Opcion 1: Por correo electronico</h2>
            <p>Envia un correo a <strong>adriancar75@hotmail.com</strong> con el asunto <em>&quot;Eliminar mis datos&quot;</em> e incluye:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Tu nombre completo.</li>
              <li>El numero de telefono registrado en Mercadito.</li>
              <li>Si eres cliente, tienda o repartidor.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Opcion 2: Por WhatsApp</h2>
            <p>Envia un mensaje al administrador indicando que deseas eliminar tu cuenta y datos.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Que datos eliminamos</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Tu perfil de usuario (nombre, telefono, PIN).</li>
              <li>Tus sesiones activas.</li>
              <li>Si eres tienda: tu tienda, productos y precios asociados.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Que datos conservamos</h2>
            <p>Por razones legales y operativas, conservamos:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Historial de pedidos completados (anonimizado).</li>
              <li>Registros de transacciones para fines contables.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Tiempo de procesamiento</h2>
            <p>Tu solicitud sera procesada en un maximo de <strong>7 dias habiles</strong>. Te confirmaremos por correo o WhatsApp cuando tus datos hayan sido eliminados.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">Contacto</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Correo: adriancar75@hotmail.com</li>
              <li>Sitio web: mercadito.cx</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
