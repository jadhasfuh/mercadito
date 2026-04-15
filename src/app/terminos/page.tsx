import Header from "@/components/Header";

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Mercadito" />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Terminos y Condiciones del Servicio</h1>
        <p className="text-sm text-gray-400 mb-6">Ultima actualizacion: 15 de abril de 2026</p>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-6 text-sm text-gray-600 leading-relaxed">
          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">1. Aceptacion de los terminos</h2>
            <p>Al usar Mercadito (mercadito.cx) aceptas estos terminos. Si no estas de acuerdo, no uses el servicio.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">2. Descripcion del servicio</h2>
            <p>Mercadito es una plataforma que conecta a comercios locales de Sahuayo, Jiquilpan y Venustiano Carranza con clientes que desean recibir productos a domicilio. Facilitamos la compra, el pago y la entrega.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">3. Para clientes</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Los precios mostrados incluyen una comision de servicio.</li>
              <li>El costo de envio se calcula segun la distancia y se muestra antes de confirmar.</li>
              <li>Los precios pueden cambiar. Al confirmar tu pedido, verificamos los precios actuales.</li>
              <li>Puedes cancelar un pedido antes de que el repartidor salga a comprar.</li>
              <li>El pago se realiza en efectivo al momento de la entrega.</li>
              <li>Los tiempos de entrega son estimados y pueden variar.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">4. Para tiendas</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>El registro es gratuito y sujeto a aprobacion.</li>
              <li>Eres responsable de mantener tus precios actualizados.</li>
              <li>Mercadito cobra una comision por unidad vendida a traves de la plataforma.</li>
              <li>Los productos deben ser legales y apropiados. Nos reservamos el derecho de rechazar productos.</li>
              <li>Podemos desactivar tu tienda si incumples estos terminos.</li>
              <li>Las fotos e informacion de productos deben ser veraces.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">5. Contenido prohibido</h2>
            <p>No se permite publicar productos o contenido relacionado con:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Armas de fuego o armas blancas.</li>
              <li>Sustancias ilegales o controladas.</li>
              <li>Contenido sexual o para adultos.</li>
              <li>Productos falsificados o de contrabando.</li>
              <li>Cualquier articulo ilegal segun las leyes mexicanas.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">6. Responsabilidad</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Mercadito actua como intermediario entre tiendas y clientes.</li>
              <li>La calidad de los productos es responsabilidad de cada tienda.</li>
              <li>No nos hacemos responsables por productos danados, en mal estado o incorrectos, aunque ayudaremos a resolver el problema.</li>
              <li>Los tiempos de entrega son estimaciones, no garantias.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">7. Horarios</h2>
            <p>El servicio opera en horarios definidos. Fuera de horario no se aceptan pedidos. Los horarios pueden variar y se comunican en la plataforma.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">8. Modificaciones</h2>
            <p>Podemos modificar estos terminos en cualquier momento. Los cambios se publicaran en esta pagina. El uso continuado del servicio implica aceptacion de los nuevos terminos.</p>
          </section>

          <section>
            <h2 className="font-bold text-gray-800 text-base mb-2">9. Contacto</h2>
            <ul className="list-disc ml-5 space-y-1">
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
