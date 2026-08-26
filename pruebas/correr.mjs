/**
 * Suite de pruebas de Mercadito.
 *
 *   ./pruebas/entorno.sh arrancar     (levanta Postgres desechable + servidor)
 *   node pruebas/correr.mjs
 *   ./pruebas/entorno.sh apagar
 *
 * Cubre lo que toca dinero y lo que se escribió sin poder probarlo: corte de
 * caja a ciegas, ventas en mostrador, promociones, tickets, comandas y la
 * ficha del menú. Cada caso lleva su cronómetro y su tope de tiempo.
 */
import { describe, it, ok, igual, cerca, api, correr } from "./arnes.mjs";
import { pool, IDS, sembrar, limpiarMovimientos, quitarPromos, diaHoyMX, cerrar } from "./datos.mjs";

await sembrar();

// Sesiones que usan todas las pruebas.
const login = async (tel) => {
  const r = await api("POST", "/api/auth", { body: { tipo: "tienda", telefono: tel, pin: IDS.pin } });
  if (r.status !== 200) throw new Error(`no pude entrar como ${tel}: ${JSON.stringify(r.datos)}`);
  return r.datos.sessionId;
};
const dueno = await login(IDS.duenoTel);
const mesero = await api("POST", "/api/auth", { body: { tipo: "mesero", telefono: IDS.meseroTel, pin: IDS.pin } })
  .then((r) => (r.status === 200 ? r.datos.sessionId : null));

// ═══════════════════════════════════════════════════════════════════════════
describe("Esquema — que las migraciones hayan corrido", () => {
  it("existen las tablas del corte de caja y de favoritos", async () => {
    const { rows } = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public'
        AND tablename IN ('caja_turnos','caja_movimientos','menu_ventas','favoritos')`
    );
    igual(rows.length, 4, "faltan tablas nuevas");
  });

  it("un solo turno abierto por caja (índice único parcial)", async () => {
    const { rows } = await pool.query(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'caja_turno_abierto_idx'"
    );
    ok(rows.length === 1, "no existe el índice");
    ok(/cerrado_at IS NULL/.test(rows[0].indexdef), "el índice no está filtrado por turno abierto");
  });

  it("cuentas.mesa_id ya no es obligatoria (venta sin mesa)", async () => {
    const { rows } = await pool.query(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name='cuentas' AND column_name='mesa_id'"
    );
    igual(rows[0].is_nullable, "YES", "mesa_id sigue NOT NULL: no se puede cobrar en mostrador");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Corte de caja a ciegas", () => {
  it("empieza sin turno abierto", async () => {
    await limpiarMovimientos();
    const r = await api("GET", "/api/tienda/caja", { token: dueno });
    igual(r.status, 200);
    igual(r.datos.turno, null, "no debería haber turno");
  });

  it("abre turno con fondo", async () => {
    const r = await api("POST", "/api/tienda/caja", {
      token: dueno,
      body: { action: "abrir", caja: "Caja principal", fondo_inicial: 500 },
    });
    igual(r.status, 201, JSON.stringify(r.datos));
  });

  it("NO revela el efectivo esperado con el turno abierto", async () => {
    const r = await api("GET", "/api/tienda/caja", { token: dueno });
    const claves = Object.keys(r.datos);
    ok(!claves.includes("esperado"), "el GET filtra el esperado — el corte a ciegas deja de servir");
    ok(!claves.includes("ventas_efectivo"), "el GET filtra las ventas en efectivo");
    igual(r.datos.turno.fondo_inicial, 500);
  });

  it("rechaza abrir un segundo turno en la misma caja", async () => {
    const r = await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "abrir", caja: "Caja principal", fondo_inicial: 100 },
    });
    igual(r.status, 409, "dejó abrir dos turnos: las ventas se partirían entre dos cortes");
  });

  it("rechaza un retiro sin motivo", async () => {
    const r = await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "movimiento", tipo: "retiro", monto: 200 },
    });
    igual(r.status, 400, "un retiro sin motivo es justo el agujero que el módulo tapa");
  });

  it("registra un retiro con motivo y una entrada", async () => {
    const r1 = await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "movimiento", tipo: "retiro", monto: 200, motivo: "Compra de insumos" },
    });
    igual(r1.status, 201, JSON.stringify(r1.datos));
    const r2 = await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "movimiento", tipo: "entrada", monto: 50 },
    });
    igual(r2.status, 201, JSON.stringify(r2.datos));

    const est = await api("GET", "/api/tienda/caja", { token: dueno });
    cerca(est.datos.retiros, 200, "retiros");
    cerca(est.datos.entradas, 50, "entradas");
  });

  it("rechaza montos absurdos", async () => {
    const r = await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "movimiento", tipo: "entrada", monto: 99999999 },
    });
    igual(r.status, 400, "aceptó un monto fuera de rango");
  });

  it("cierra y calcula bien la diferencia", async () => {
    // Esperado = 500 fondo − 200 retiro + 50 entrada = 350. Declaramos 340.
    const r = await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "cerrar", declarado: 340, fondo_siguiente: 300, nota: "Turno de prueba" },
    });
    igual(r.status, 200, JSON.stringify(r.datos));
    cerca(r.datos.corte.esperado, 350, "esperado");
    cerca(r.datos.corte.diferencia, -10, "faltante");
  });

  it("no deja cerrar dos veces el mismo turno", async () => {
    const r = await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "cerrar", declarado: 340 },
    });
    igual(r.status, 409, "un turno firmado no se puede recalcular");
  });

  it("el mesero NO ve el historial de cortes", async () => {
    if (!mesero) throw new Error("no hay sesión de mesero");
    const r = await api("GET", "/api/tienda/caja?historial=1", { token: mesero });
    igual(r.status, 403, "el cajero podría ver cuánto puede faltar sin que se note");
  });

  it("el dueño sí ve el historial, con la diferencia firmada", async () => {
    const r = await api("GET", "/api/tienda/caja?historial=1", { token: dueno });
    igual(r.status, 200);
    ok(r.datos.length >= 1, "no quedó registrado el corte");
    cerca(r.datos[0].diferencia, -10, "diferencia del historial");
    igual(r.datos[0].cerrado_por_nombre, "Dueño Prueba");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Ventas en mostrador", () => {
  it("cobra una venta simple y asigna folio 1", async () => {
    await limpiarMovimientos();
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: {
        items: [{ producto_id: IDS.prodA, cantidad: 2 }],
        servicio: "local",
        pagos: [{ metodo: "caja", monto: 200 }],
      },
    });
    igual(r.status, 201, JSON.stringify(r.datos));
    cerca(r.datos.venta.total, 200, "total");
    igual(r.datos.venta.folio, 1, "folio");
    igual(r.datos.venta.en_turno, false, "no había caja abierta: debe avisarlo");
  });

  it("rechaza pagos que no suman el total", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: { items: [{ producto_id: IDS.prodA, cantidad: 1 }], pagos: [{ metodo: "caja", monto: 50 }] },
    });
    igual(r.status, 400, "un cobro descuadrado deja el corte mal para siempre");
  });

  it("ignora el precio que mande el cliente y usa el suyo", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: {
        items: [{ producto_id: IDS.prodB, cantidad: 1, precio: 1 }],
        pagos: [{ metodo: "caja", monto: 50 }],
      },
    });
    igual(r.status, 201, "debería cobrar $50, el precio real");
    cerca(r.datos.venta.total, 50, "total");
  });

  it("exige dirección cuando el servicio es a domicilio", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: {
        items: [{ producto_id: IDS.prodB, cantidad: 1 }],
        servicio: "domicilio",
        pagos: [{ metodo: "caja", monto: 50 }],
      },
    });
    igual(r.status, 400, "un domicilio sin dirección no es un pedido");
  });

  it("el folio avanza y no se repite", async () => {
    const { rows } = await pool.query(
      "SELECT folio FROM cuentas WHERE puesto_id = $1 AND folio IS NOT NULL ORDER BY folio",
      [IDS.puesto]
    );
    const folios = rows.map((r) => Number(r.folio));
    igual(new Set(folios).size, folios.length, "hay folios repetidos");
    ok(folios.length >= 2, "no se asignaron folios");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Corte con pago mixto", () => {
  it("reparte efectivo y tarjeta a su método, sin contar doble la cuenta", async () => {
    await limpiarMovimientos();
    await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "abrir", caja: "Caja principal", fondo_inicial: 0 },
    });
    // $200: 120 en efectivo + 80 con tarjeta.
    const v = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: {
        items: [{ producto_id: IDS.prodA, cantidad: 2 }],
        pagos: [{ metodo: "caja", monto: 120 }, { metodo: "tarjeta", monto: 80 }],
      },
    });
    igual(v.status, 201, JSON.stringify(v.datos));

    const cierre = await api("POST", "/api/tienda/caja", {
      token: dueno, body: { action: "cerrar", declarado: 120 },
    });
    igual(cierre.status, 200, JSON.stringify(cierre.datos));
    const c = cierre.datos.corte;
    cerca(c.ventas_efectivo, 120, "sólo los $120 tocaron el cajón");
    cerca(c.ventas_tarjeta, 80, "los $80 de tarjeta");
    cerca(c.esperado, 120, "esperado");
    cerca(c.diferencia, 0, "la caja debe cuadrar");
    igual(c.cuentas, 1, "el pago mixto contó la cuenta dos veces");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Promociones", () => {
  it("rechaza una promo más cara que el precio normal", async () => {
    await quitarPromos();
    const r = await api("PATCH", "/api/precios", {
      token: dueno,
      body: { producto_id: IDS.prodA, puesto_id: IDS.puesto, promo: { precio: 150 } },
    });
    igual(r.status, 400, "eso no es promo, es un aumento anunciado");
  });

  it("rechaza media franja horaria", async () => {
    const r = await api("PATCH", "/api/precios", {
      token: dueno,
      body: { producto_id: IDS.prodA, puesto_id: IDS.puesto, promo: { precio: 60, desde: "18:00" } },
    });
    igual(r.status, 400, "con sólo una hora la franja no se puede evaluar");
  });

  it("guarda una promo válida para hoy", async () => {
    const r = await api("PATCH", "/api/precios", {
      token: dueno,
      body: {
        producto_id: IDS.prodA, puesto_id: IDS.puesto,
        promo: { precio: 60, etiqueta: "Martes de tacos", dias: [diaHoyMX()] },
      },
    });
    igual(r.status, 200, JSON.stringify(r.datos));
  });

  it("el menú muestra el precio de promo y el de antes tachado", async () => {
    const r = await api("GET", `/api/menu/${IDS.puesto}`);
    igual(r.status, 200);
    const prods = r.datos.secciones.flatMap((s) => s.grupos.flatMap((g) => g.productos));
    const p = prods.find((x) => x.id === IDS.prodA);
    ok(p, "el producto no salió en el menú");
    cerca(p.precio, 60, "el menú debe anunciar el precio de promo");
    cerca(p.precio_antes, 100, "debe traer el de lista para tacharlo");
    igual(p.promo_etiqueta, "Martes de tacos");
  });

  it("la caja cobra EXACTAMENTE lo que anuncia el menú", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: { items: [{ producto_id: IDS.prodA, cantidad: 1 }], pagos: [{ metodo: "caja", monto: 60 }] },
    });
    igual(r.status, 201, "la caja no aplicó la promo: el menú anuncia un precio y se cobra otro");
    cerca(r.datos.venta.total, 60, "total cobrado");
  });

  it("no aplica en un día que no es el de la promo", async () => {
    const otroDia = (diaHoyMX() + 3) % 7;
    await api("PATCH", "/api/precios", {
      token: dueno,
      body: { producto_id: IDS.prodA, puesto_id: IDS.puesto, promo: { precio: 60, dias: [otroDia] } },
    });
    const r = await api("GET", `/api/menu/${IDS.puesto}`);
    const p = r.datos.secciones.flatMap((s) => s.grupos.flatMap((g) => g.productos)).find((x) => x.id === IDS.prodA);
    cerca(p.precio, 100, "aplicó una promo de otro día");
    igual(p.precio_antes, null, "pintó un tachado falso");
  });

  it("no aplica fuera de la franja horaria", async () => {
    await api("PATCH", "/api/precios", {
      token: dueno,
      body: {
        producto_id: IDS.prodA, puesto_id: IDS.puesto,
        // Franja de un minuto a una hora imposible de que sea "ahora".
        promo: { precio: 60, dias: [diaHoyMX()], desde: "03:00", hasta: "03:01" },
      },
    });
    const r = await api("GET", `/api/menu/${IDS.puesto}`);
    const p = r.datos.secciones.flatMap((s) => s.grupos.flatMap((g) => g.productos)).find((x) => x.id === IDS.prodA);
    cerca(p.precio, 100, "aplicó una promo fuera de su horario");
  });

  it("no aplica si ya venció", async () => {
    await api("PATCH", "/api/precios", {
      token: dueno,
      body: {
        producto_id: IDS.prodA, puesto_id: IDS.puesto,
        promo: { precio: 60, termina: "2020-01-01" },
      },
    });
    const r = await api("GET", `/api/menu/${IDS.puesto}`);
    const p = r.datos.secciones.flatMap((s) => s.grupos.flatMap((g) => g.productos)).find((x) => x.id === IDS.prodA);
    cerca(p.precio, 100, "aplicó una promo vencida");
  });

  it("quitarla devuelve el precio de lista", async () => {
    const r = await api("PATCH", "/api/precios", {
      token: dueno, body: { producto_id: IDS.prodA, puesto_id: IDS.puesto, promo: null },
    });
    igual(r.status, 200);
    const m = await api("GET", `/api/menu/${IDS.puesto}`);
    const p = m.datos.secciones.flatMap((s) => s.grupos.flatMap((g) => g.productos)).find((x) => x.id === IDS.prodA);
    cerca(p.precio, 100);
    igual(p.promo_etiqueta, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Comandas de cocina", () => {
  it("la venta de mostrador entra al tablero con su cronómetro", async () => {
    await limpiarMovimientos();
    await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: {
        items: [{ producto_id: IDS.prodA, cantidad: 1, notas: "sin cebolla" }],
        servicio: "llevar",
        pagos: [{ metodo: "caja", monto: 100 }],
        a_cocina: true,
      },
    });
    const r = await api("GET", "/api/tienda/comandas", { token: dueno });
    igual(r.status, 200);
    ok(r.datos.length >= 1, "la venta de mostrador no llegó a cocina");
    const c = r.datos[0];
    ok(/Para llevar/.test(c.etiqueta), `la comanda debería rotularse por servicio, llegó "${c.etiqueta}"`);
    ok(c.espera_desde, "sin espera_desde no hay cronómetro ni orden por antigüedad");
    igual(c.items[0].notas, "sin cebolla", "la nota no llegó a cocina");
  });

  it("una venta que no va a cocina no ensucia el tablero", async () => {
    await limpiarMovimientos();
    await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: {
        items: [{ producto_id: IDS.prodB, cantidad: 1 }],
        pagos: [{ metodo: "caja", monto: 50 }],
        a_cocina: false,
      },
    });
    const r = await api("GET", "/api/tienda/comandas", { token: dueno });
    igual(r.datos.length, 0, "una venta ya servida no debe aparecer en cocina");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Tickets y reimpresión", () => {
  it("lista los tickets cobrados", async () => {
    const r = await api("GET", "/api/tienda/tickets", { token: dueno });
    igual(r.status, 200);
    ok(r.datos.length >= 1, "no hay tickets");
    ok(r.datos[0].items.length >= 1, "el ticket llegó sin renglones: no se puede reimprimir");
  });

  it("busca por folio", async () => {
    const todos = await api("GET", "/api/tienda/tickets", { token: dueno });
    const folio = todos.datos.find((t) => t.folio != null)?.folio;
    ok(folio != null, "ningún ticket tiene folio");
    const r = await api("GET", `/api/tienda/tickets?q=${folio}`, { token: dueno });
    igual(r.datos.length, 1, "la búsqueda por folio no filtró");
    igual(r.datos[0].folio, folio);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Menú público y ficha del negocio", () => {
  it("trae horario, formas de pago y de servicio", async () => {
    const r = await api("GET", `/api/menu/${IDS.puesto}`);
    igual(r.status, 200);
    const p = r.datos.puesto;
    igual(p.horario.length, 6, "el horario de la semana no llegó completo");
    igual(JSON.stringify(p.metodos_pago), JSON.stringify(["efectivo", "tarjeta"]));
    igual(JSON.stringify(p.servicios_pedido), JSON.stringify(["local", "llevar"]));
    ok(p.lat != null && p.lng != null, "sin coordenadas no hay 'cómo llegar'");
  });

  it("cuenta la vista del menú", async () => {
    const antes = await pool.query("SELECT menu_vistas FROM puestos WHERE id = $1", [IDS.puesto]);
    await api("POST", `/api/menu/${IDS.puesto}/evento`, { body: { tipo: "vista" } });
    const dsp = await pool.query("SELECT menu_vistas FROM puestos WHERE id = $1", [IDS.puesto]);
    igual(Number(dsp.rows[0].menu_vistas), Number(antes.rows[0].menu_vistas) + 1);
  });

  it("el beacon de pedido alimenta los más vendidos", async () => {
    await api("POST", `/api/menu/${IDS.puesto}/evento`, {
      body: { tipo: "pedido", items: [{ producto_id: IDS.prodB, cantidad: 3 }] },
    });
    const r = await api("GET", `/api/menu/${IDS.puesto}/mas-vendidos`);
    const fila = r.datos.find((x) => x.producto_id === IDS.prodB);
    ok(fila, "el producto no entró al top");
    ok(fila.pedidos >= 1, "no contó el pedido");
  });

  it("no deja inflar el top con una cantidad absurda", async () => {
    await api("POST", `/api/menu/${IDS.puesto}/evento`, {
      body: { tipo: "pedido", items: [{ producto_id: IDS.prodA, cantidad: 999999 }] },
    });
    const { rows } = await pool.query(
      "SELECT cantidad FROM menu_ventas WHERE puesto_id = $1 AND producto_id = $2",
      [IDS.puesto, IDS.prodA]
    );
    ok(Number(rows[0].cantidad) <= 500, `el tope no se aplicó: quedó ${rows[0].cantidad}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Favoritos", () => {
  it("sin sesión responde 200 y sin datos, no 401", async () => {
    const r = await api("GET", "/api/favoritos");
    igual(r.status, 200, "un 401 rompería el corazón para quien llega por QR");
    igual(r.datos.autenticado, false);
  });

  it("con sesión guarda y quita", async () => {
    const a = await api("POST", "/api/favoritos", {
      token: dueno, body: { tipo: "puesto", ref_id: IDS.puesto, activo: true },
    });
    igual(a.status, 200, JSON.stringify(a.datos));
    ok(a.datos.puestos.includes(IDS.puesto), "no guardó el favorito");

    const b = await api("POST", "/api/favoritos", {
      token: dueno, body: { tipo: "puesto", ref_id: IDS.puesto, activo: false },
    });
    ok(!b.datos.puestos.includes(IDS.puesto), "no lo quitó");
  });

  it("rechaza un tipo inválido", async () => {
    const r = await api("POST", "/api/favoritos", {
      token: dueno, body: { tipo: "loquesea", ref_id: "x" },
    });
    igual(r.status, 400);
  });

  it("el merge une sin borrar lo que ya había", async () => {
    await api("POST", "/api/favoritos", { token: dueno, body: { tipo: "producto", ref_id: IDS.prodA } });
    const r = await api("PUT", "/api/favoritos", { token: dueno, body: { productos: [IDS.prodB] } });
    ok(r.datos.productos.includes(IDS.prodA), "el merge borró un favorito que ya estaba");
    ok(r.datos.productos.includes(IDS.prodB), "el merge no subió el nuevo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Resumen y centro de ayuda", () => {
  it("el resumen refleja las ventas del periodo", async () => {
    await limpiarMovimientos();
    await api("POST", "/api/tienda/caja", { token: dueno, body: { action: "abrir", fondo_inicial: 0 } });
    await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: { items: [{ producto_id: IDS.prodA, cantidad: 1 }], pagos: [{ metodo: "caja", monto: 100 }] },
    });
    const r = await api("GET", "/api/tienda/resumen?dias=7", { token: dueno });
    igual(r.status, 200);
    igual(r.datos.mesas.cuentas, 1, "la venta no llegó al resumen");
    cerca(r.datos.mesas.total, 100, "total del resumen");
    cerca(r.datos.mesas.ticket_promedio, 100, "ticket promedio");
    ok(r.datos.mesas.horas_pico.length >= 1, "no calculó la hora pico");
  });

  it("el centro de ayuda marca lo que el negocio ya usa", async () => {
    const r = await api("GET", "/api/tienda/funciones", { token: dueno });
    igual(r.status, 200);
    igual(r.datos.menu.activado, true, "tiene productos y menú público");
    igual(r.datos.caja.activado, true, "ya abrió al menos un turno");
    igual(r.datos.ficha.activado, true, "ya configuró sus formas de servicio");
  });

  it("un mesero no puede leer el resumen del negocio", async () => {
    if (!mesero) throw new Error("no hay sesión de mesero");
    const r = await api("GET", "/api/tienda/resumen", { token: mesero });
    igual(r.status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Permisos", () => {
  it("sin sesión no se cobra en mostrador", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      body: { items: [{ producto_id: IDS.prodA, cantidad: 1 }], pagos: [{ metodo: "caja", monto: 100 }] },
    });
    igual(r.status, 403);
  });

  it("sin sesión no se abre la caja", async () => {
    const r = await api("POST", "/api/tienda/caja", { body: { action: "abrir", fondo_inicial: 0 } });
    igual(r.status, 403);
  });

  it("un negocio no puede poner promociones en productos de otro", async () => {
    const r = await api("PATCH", "/api/precios", {
      token: dueno,
      body: { producto_id: IDS.prodA, puesto_id: "otro-puesto", promo: { precio: 10 } },
    });
    igual(r.status, 403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tanda adversaria: casos que la primera vuelta no tocó y donde es más
// probable que algo esté mal. Una suite que pasa entera a la primera suele
// significar que las pruebas son blandas, no que el código esté bien.
// ═══════════════════════════════════════════════════════════════════════════
describe("Bordes — mostrador", () => {
  it("cobra bien una venta CON propina", async () => {
    await limpiarMovimientos();
    // $100 de producto + $20 de propina: el cliente paga 120.
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: {
        items: [{ producto_id: IDS.prodA, cantidad: 1 }],
        propina: 20,
        pagos: [{ metodo: "caja", monto: 120 }],
      },
    });
    igual(r.status, 201, `rechazó una venta con propina: ${JSON.stringify(r.datos)}`);
    cerca(r.datos.venta.total, 100, "el total del producto");
    cerca(r.datos.venta.propina, 20, "la propina");
  });

  it("la propina entra al corte como propina, no como venta", async () => {
    await limpiarMovimientos();
    await api("POST", "/api/tienda/caja", { token: dueno, body: { action: "abrir", fondo_inicial: 0 } });
    await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: {
        items: [{ producto_id: IDS.prodA, cantidad: 1 }],
        propina: 20,
        pagos: [{ metodo: "caja", monto: 120 }],
      },
    });
    // El cliente entregó $120: en el cajón hay $120, propina incluida.
    const c = await api("POST", "/api/tienda/caja", { token: dueno, body: { action: "cerrar", declarado: 120 } });
    igual(c.status, 200, JSON.stringify(c.datos));
    cerca(c.datos.corte.ventas_efectivo, 120, "el efectivo recibido incluye la propina");
    cerca(c.datos.corte.propinas, 20, "la propina se reporta aparte, como informativo");
    cerca(c.datos.corte.diferencia, 0, "contar sólo $100 inventaría un sobrante de $20 cada noche");
  });

  it("normaliza cantidades cero o negativas a 1", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: { items: [{ producto_id: IDS.prodA, cantidad: -5 }], pagos: [{ metodo: "caja", monto: 100 }] },
    });
    igual(r.status, 201, "una cantidad negativa debería normalizarse, no cobrar en negativo");
    cerca(r.datos.venta.total, 100);
  });

  it("rechaza un producto que no es de la tienda", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: { items: [{ producto_id: "no-existe-jamas" }], pagos: [{ metodo: "caja", monto: 10 }] },
    });
    igual(r.status, 409);
  });

  it("rechaza un método de pago inventado", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno,
      body: { items: [{ producto_id: IDS.prodA, cantidad: 1 }], pagos: [{ metodo: "bitcoin", monto: 100 }] },
    });
    igual(r.status, 400);
  });

  it("rechaza una venta sin renglones", async () => {
    const r = await api("POST", "/api/tienda/mostrador", {
      token: dueno, body: { items: [], pagos: [{ metodo: "caja", monto: 0 }] },
    });
    igual(r.status, 400);
  });
});

describe("Bordes — mesa completa", () => {
  it("el pedido de mesa cobra el precio de promo y guarda la nota", async () => {
    await limpiarMovimientos();
    // Mesa con su QR.
    await pool.query("DELETE FROM mesas WHERE puesto_id = $1", [IDS.puesto]);
    await pool.query(
      "INSERT INTO mesas (id, puesto_id, etiqueta, token, activa) VALUES ('mesa-p1', $1, 'Mesa 1', 'tok-pruebas', true)",
      [IDS.puesto]
    );
    await api("PATCH", "/api/precios", {
      token: dueno,
      body: { producto_id: IDS.prodA, puesto_id: IDS.puesto, promo: { precio: 60, etiqueta: "Promo mesa" } },
    });

    const abrir = await api("POST", "/api/mesa/tok-pruebas/abrir");
    igual(abrir.status, 200, JSON.stringify(abrir.datos));

    const ped = await api("POST", "/api/mesa/tok-pruebas/pedido", {
      body: {
        cuenta_id: abrir.datos.cuenta_id,
        items: [{ producto_id: IDS.prodA, cantidad: 2, notas: "bien dorado" }],
      },
    });
    igual(ped.status, 201, JSON.stringify(ped.datos));
    cerca(ped.datos.total, 120, "la mesa debe cobrar 2 × $60 de promo, no 2 × $100");

    const com = await api("GET", "/api/tienda/comandas", { token: dueno });
    const mesa = com.datos.find((c) => c.etiqueta === "Mesa 1");
    ok(mesa, "la mesa no apareció en cocina");
    igual(mesa.items[0].notas, "bien dorado", "la nota del comensal no llegó a cocina");
    await quitarPromos();
  });

  it("cerrar la cuenta de mesa la mete al turno abierto y al corte", async () => {
    await api("POST", "/api/tienda/caja", { token: dueno, body: { action: "abrir", fondo_inicial: 0 } });
    // Una venta nueva DESPUÉS de abrir la caja.
    const abrir = await api("POST", "/api/mesa/tok-pruebas/abrir");
    await api("POST", "/api/mesa/tok-pruebas/pedido", {
      body: { cuenta_id: abrir.datos.cuenta_id, items: [{ producto_id: IDS.prodB, cantidad: 1 }] },
    });
    const cerrarCta = await api("PATCH", `/api/cuentas/${abrir.datos.cuenta_id}`, {
      token: dueno, body: { action: "cerrar", metodo_pago: "caja", propina: 10 },
    });
    igual(cerrarCta.status, 200, JSON.stringify(cerrarCta.datos));

    // La mesa REUSA su cuenta abierta, así que arrastra los $120 del pedido
    // anterior: 120 + 50 + 10 de propina = 180. Y la venta se atribuye al
    // turno en el que se COBRÓ, no en el que se pidió — que es cuando el
    // dinero entró al cajón.
    const c = await api("POST", "/api/tienda/caja", { token: dueno, body: { action: "cerrar", declarado: 180 } });
    cerca(c.datos.corte.ventas_efectivo, 180, "la cuenta de mesa no entró completa al corte");
    cerca(c.datos.corte.diferencia, 0, "la caja debe cuadrar");
  });
});

describe("Bordes — promociones y más vendidos", () => {
  it("una promo sin días marcados aplica todos los días", async () => {
    await api("PATCH", "/api/precios", {
      token: dueno,
      body: { producto_id: IDS.prodB, puesto_id: IDS.puesto, promo: { precio: 30, dias: [] } },
    });
    const r = await api("GET", `/api/menu/${IDS.puesto}`);
    const p = r.datos.secciones.flatMap((s) => s.grupos.flatMap((g) => g.productos)).find((x) => x.id === IDS.prodB);
    cerca(p.precio, 30, "sin días marcados debería aplicar siempre");
    await quitarPromos();
  });

  it("el mismo platillo en dos renglones cuenta como UN pedido", async () => {
    await limpiarMovimientos();
    await api("POST", `/api/menu/${IDS.puesto}/evento`, {
      body: {
        tipo: "pedido",
        items: [
          { producto_id: IDS.prodA, cantidad: 1 },
          { producto_id: IDS.prodA, cantidad: 2 },
        ],
      },
    });
    const { rows } = await pool.query(
      "SELECT pedidos, cantidad FROM menu_ventas WHERE puesto_id = $1 AND producto_id = $2",
      [IDS.puesto, IDS.prodA]
    );
    igual(Number(rows[0].pedidos), 1, "dos variantes del mismo platillo no son dos pedidos");
    cerca(rows[0].cantidad, 3, "las cantidades sí se suman");
  });

  it("el beacon ignora renglones basura sin tumbarse", async () => {
    const r = await api("POST", `/api/menu/${IDS.puesto}/evento`, {
      body: { tipo: "pedido", items: [{ producto_id: null }, { cantidad: "hola" }, "basura"] },
    });
    igual(r.status, 200, "telemetría mal formada no puede romper el pedido del cliente");
  });
});

describe("Bordes — permisos del mesero y búsquedas", () => {
  it("el mesero SÍ puede operar la caja", async () => {
    if (!mesero) throw new Error("no hay sesión de mesero");
    await limpiarMovimientos();
    const a = await api("POST", "/api/tienda/caja", {
      token: mesero, body: { action: "abrir", caja: "Caja del mesero", fondo_inicial: 100 },
    });
    igual(a.status, 201, "el cajero tiene que poder abrir su turno");
    const c = await api("POST", "/api/tienda/caja", { token: mesero, body: { action: "cerrar", declarado: 100 } });
    igual(c.status, 200, "y cerrarlo");
    cerca(c.datos.corte.diferencia, 0);
  });

  it("buscar tickets con texto no numérico no revienta", async () => {
    const r = await api("GET", "/api/tienda/tickets?q=' OR 1=1 --", { token: dueno });
    igual(r.status, 200, "la búsqueda debe aguantar cualquier texto");
    ok(Array.isArray(r.datos));
  });

  it("un menú que no existe responde 404, no 500", async () => {
    const r = await api("GET", "/api/menu/no-existe-jamas");
    igual(r.status, 404);
  });
});

const fallos = await correr();
await limpiarMovimientos();
await cerrar();
process.exit(fallos > 0 ? 1 : 0);
