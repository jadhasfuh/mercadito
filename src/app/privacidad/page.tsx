import Header from "@/components/Header";

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Mercadito" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Politica de Privacidad</h1>
        <p className="text-sm text-gray-400 mb-6">Ultima actualizacion: 15 de abril de 2026</p>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-6 text-sm text-gray-600 leading-relaxed">
          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">1. Informacion que recopilamos</h2>
            <p>Mercadito (mercadito.cx) recopila la siguiente informacion cuando usas nuestro servicio:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Nombre:</strong> Para identificarte en tus pedidos y que el repartidor sepa a quien entregar.</li>
              <li><strong>Numero de telefono / WhatsApp:</strong> Para contactarte sobre tu pedido y como identificador de cuenta.</li>
              <li><strong>Direccion de entrega:</strong> Para calcular costos de envio y entregar tu pedido.</li>
              <li><strong>Ubicacion (GPS):</strong> Solo cuando tu lo permites, para facilitar la seleccion de direccion en el mapa.</li>
              <li><strong>Historial de pedidos:</strong> Productos solicitados, precios, estado del pedido.</li>
            </ul>
            <p className="mt-2">Para tiendas registradas, tambien recopilamos:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Nombre del negocio y del dueno.</li>
              <li>Direccion y ubicacion del negocio.</li>
              <li>Catalogo de productos y precios.</li>
              <li>PIN de acceso (almacenado de forma segura).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">2. Como usamos tu informacion</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Procesar y entregar tus pedidos.</li>
              <li>Calcular costos de envio basados en tu ubicacion.</li>
              <li>Contactarte por WhatsApp o telefono sobre el estado de tu pedido.</li>
              <li>Mostrar precios y productos disponibles de tiendas cercanas.</li>
              <li>Mejorar nuestro servicio.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">3. Con quien compartimos tu informacion</h2>
            <p>Tu informacion se comparte unicamente con:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Repartidores:</strong> Nombre, telefono y direccion para realizar la entrega.</li>
              <li><strong>Tiendas:</strong> Los productos que pediste de su negocio (sin tu direccion).</li>
            </ul>
            <p className="mt-2"><strong>No vendemos, alquilamos ni compartimos tu informacion con terceros</strong> para fines publicitarios o de marketing.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">4. Servicios de terceros</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong>OpenStreetMap / Nominatim:</strong> Para busqueda de direcciones y mapas. Tu ubicacion se envia a sus servidores para obtener resultados.</li>
              <li><strong>OSRM:</strong> Para calcular rutas de entrega.</li>
              <li><strong>Meta / WhatsApp Business:</strong> Para enviar notificaciones sobre tus pedidos.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">5. Almacenamiento y seguridad</h2>
            <p>Tu informacion se almacena en servidores seguros. Las sesiones se manejan con cookies HTTP seguras. Los PINs de acceso se almacenan de forma protegida. Usamos conexion HTTPS para toda la comunicacion.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">6. Tus derechos</h2>
            <p>Tienes derecho a:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Solicitar la eliminacion de tu cuenta y datos personales.</li>
              <li>Acceder a la informacion que tenemos sobre ti.</li>
              <li>Corregir informacion incorrecta.</li>
              <li>Dejar de usar el servicio en cualquier momento.</li>
            </ul>
            <p className="mt-2">Para ejercer estos derechos, contactanos por correo o WhatsApp.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">7. Cookies</h2>
            <p>Usamos una cookie de sesion (<code>mercadito_session</code>) para mantener tu sesion activa. No usamos cookies de rastreo ni de publicidad.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">8. Menores de edad</h2>
            <p>Mercadito no esta dirigido a menores de 13 anos. No recopilamos intencionalmente informacion de menores.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">9. Cambios a esta politica</h2>
            <p>Podemos actualizar esta politica. Los cambios se publicaran en esta pagina con la fecha de actualizacion.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">10. Contacto</h2>
            <p>Si tienes preguntas sobre esta politica de privacidad:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Correo: adriancar75@hotmail.com</li>
              <li>Sitio web: mercadito.cx</li>
              <li>Ubicacion: Sahuayo, Michoacan, Mexico</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
