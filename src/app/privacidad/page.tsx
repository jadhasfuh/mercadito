import Header from "@/components/Header";

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Mercadito" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Politica de Privacidad</h1>
        <p className="text-sm text-gray-400 mb-6">Ultima actualizacion: 19 de mayo de 2026</p>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-6 text-sm text-gray-600 leading-relaxed">
          <section>
            <p>Esta politica aplica al sitio web <strong>mercadito.cx</strong> y a las aplicaciones moviles oficiales de Mercadito para iOS y Android.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">1. Informacion que recopilamos</h2>
            <p>Mercadito recopila la siguiente informacion cuando usas nuestro servicio:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Nombre:</strong> Para identificarte en tus pedidos y que el repartidor sepa a quien entregar.</li>
              <li><strong>Numero de telefono / WhatsApp:</strong> Para contactarte sobre tu pedido y como identificador de cuenta.</li>
              <li><strong>Direccion de entrega:</strong> Para calcular costos de envio y entregar tu pedido.</li>
              <li><strong>Ubicacion (GPS):</strong> Solo cuando tu lo permites, para facilitar la seleccion de direccion en el mapa o marcar la ubicacion de tu tienda.</li>
              <li><strong>Fotografias:</strong> Cuando una tienda sube fotos de productos o logo desde la camara o galeria del dispositivo.</li>
              <li><strong>Token de notificaciones push:</strong> Identificador anonimo que provee Apple (APNs) o Google (FCM) para enviarte avisos sobre el estado de tu pedido o nuevos pedidos disponibles.</li>
              <li><strong>Informacion basica del dispositivo:</strong> Sistema operativo y version de la app, usado solo para soporte tecnico y compatibilidad.</li>
              <li><strong>Historial de pedidos:</strong> Productos solicitados, precios, estado del pedido.</li>
            </ul>
            <p className="mt-2">Para tiendas registradas, tambien recopilamos:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Nombre del negocio y del dueno.</li>
              <li>Direccion y ubicacion del negocio.</li>
              <li>Catalogo de productos y precios.</li>
              <li>PIN de acceso (almacenado de forma segura).</li>
            </ul>
            <p className="mt-2"><strong>No recopilamos</strong> datos biometricos, contactos, agenda, archivos personales, ni rastreamos tu actividad fuera de la app.</p>
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
              <li><strong>Apple Push Notification Service (APNs)</strong> y <strong>Google Firebase Cloud Messaging (FCM)</strong>: Para entregar notificaciones push a tu dispositivo. Reciben solo el token anonimo del dispositivo y el contenido de la notificacion.</li>
              <li><strong>Expo Push Service:</strong> Intermediario que envia las notificaciones push desde nuestro servidor a APNs / FCM.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">4.1 Permisos en la app movil</h2>
            <p>La app solicita los siguientes permisos del sistema:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Ubicacion (mientras usas la app):</strong> Para marcar tu punto de entrega o la ubicacion de tu tienda en el mapa. No rastreamos tu ubicacion en segundo plano.</li>
              <li><strong>Camara:</strong> Solo cuando tomas una foto de un producto o del logo de tu tienda.</li>
              <li><strong>Fotos / galeria:</strong> Solo cuando eliges una imagen para subir como producto o logo.</li>
              <li><strong>Notificaciones:</strong> Para avisarte del estado de tu pedido o nuevos pedidos. Puedes desactivarlas en cualquier momento desde los ajustes del sistema.</li>
            </ul>
            <p className="mt-2">Todos los permisos son opcionales. Puedes denegarlos o revocarlos desde los ajustes de tu dispositivo; algunas funciones podrian dejar de operar.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">5. Almacenamiento y seguridad</h2>
            <p>Tu informacion se almacena en servidores seguros. Las sesiones se manejan con cookies HTTP seguras. Los PINs de acceso se almacenan de forma protegida. Usamos conexion HTTPS para toda la comunicacion.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">6. Tus derechos</h2>
            <p>Tienes derecho a:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Eliminar tu cuenta directamente desde la app</strong> (Perfil → Eliminar mi cuenta). Tu nombre, telefono y PIN se anonimizan y se cierran tus sesiones.</li>
              <li>Solicitar la eliminacion por correo o WhatsApp (ver <a href="/eliminar-datos" className="text-orange-600 underline">eliminar mis datos</a>).</li>
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
