import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  Check,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "../../services/api";

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function nuevoUuid() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function nuevoBorrador() {
  return {
    id: null,
    uuid: nuevoUuid(),
    estado: "BORRADOR",
    origen: "MANUAL",
    deposito_id: 0,
    proveedor_id: null,
    proveedor_nombre: "",
    proveedor_documento: "",
    proveedor_condicion_iva: "",
    proveedor_domicilio: "",
    tipo_comprobante: "FACTURA",
    letra: "A",
    punto_venta: 1,
    numero: "",
    fecha: hoy(),
    fecha_vencimiento: "",
    condicion_pago: "CONTADO",
    moneda: "PES",
    cotizacion: 1,
    crear_factura: false,
    actualizar_costo: true,
    actualizar_precio: false,
    costo_incluye_iva: false,
    margen_porcentaje: 30,
    permitir_parcial: false,
    permitir_diferencia_total: false,
    observaciones: "",
    total_documento: 0,
    exento_no_gravado: 0,
    percepciones: 0,
    subtotal: 0,
    iva: 0,
    total: 0,
    diferencia_total: 0,
    items: [],
  };
}

const dinero = (valor: any) =>
  Number(valor || 0).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });

const numero = (valor: any, defecto = 0) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : defecto;
};

const redondear = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

function estadoBadge(estado: string) {
  if (estado === "CONFIRMADA") return "ok";
  if (estado === "ANULADA") return "danger";
  return "pending";
}

export function RecepcionMercaderiaPage() {
  const [draft, setDraft] = useState<any>(() => nuevoBorrador());
  const [depositos, setDepositos] = useState<any[]>([]);
  const [recientes, setRecientes] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtroPendientes, setFiltroPendientes] = useState(false);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [barcode, setBarcode] = useState("");
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<any[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [proveedorQuery, setProveedorQuery] = useState("");
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [assignIndex, setAssignIndex] = useState<number | null>(null);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<any[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [nuevoProducto, setNuevoProducto] = useState<any>({});
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  async function cargarRecientes() {
    try {
      const r = await api.listReceptions("", 12);
      setRecientes(r.recepciones || []);
    } catch {
      setRecientes([]);
    }
  }

  useEffect(() => {
    async function iniciar() {
      try {
        const [deps, lista] = await Promise.all([
          api.receptionDeposits(),
          api.listReceptions("", 12),
        ]);
        const listaDepositos = deps.depositos || [];
        setDepositos(listaDepositos);
        setRecientes(lista.recepciones || []);
        if (listaDepositos.length) {
          setDraft((actual: any) =>
            actual.deposito_id ? actual : { ...actual, deposito_id: listaDepositos[0].id },
          );
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
    iniciar();
  }, []);

  const itemCalculado = (item: any) => {
    const iva = numero(item.iva, 21);
    const costo = numero(item.costo_unitario);
    const neto = draft.costo_incluye_iva ? costo / (1 + iva / 100) : costo;
    const importe = neto * numero(item.cantidad_facturada) * (1 - numero(item.descuento) / 100) * (1 + iva / 100);
    return {
      neto,
      importe: redondear(importe),
      precioSugerido: redondear(neto * (1 + iva / 100) * (1 + numero(draft.margen_porcentaje) / 100)),
    };
  };

  const totales = useMemo(() => {
    let subtotal = 0;
    let iva = 0;
    for (const item of draft.items || []) {
      const calculo = itemCalculado(item);
      const base = calculo.neto * numero(item.cantidad_facturada) * (1 - numero(item.descuento) / 100);
      subtotal += base;
      iva += base * (numero(item.iva) / 100);
    }
    subtotal = redondear(subtotal);
    iva = redondear(iva);
    const total = redondear(subtotal + iva + numero(draft.exento_no_gravado) + numero(draft.percepciones));
    const documento = numero(draft.total_documento);
    return {
      subtotal,
      iva,
      total,
      diferencia: redondear((documento || total) - total),
    };
  }, [draft.items, draft.costo_incluye_iva, draft.exento_no_gravado, draft.percepciones, draft.total_documento, draft.margen_porcentaje]);

  const recibidos = (draft.items || []).filter((item: any) => numero(item.cantidad_recibida) > 0);
  const pendientes = (draft.items || []).filter((item: any) => !item.producto_id);
  const sinRecibir = (draft.items || []).filter(
    (item: any) => numero(item.cantidad_facturada) > 0 && numero(item.cantidad_recibida) <= 0,
  );
  const sinProductoRecibido = recibidos.filter((item: any) => !item.producto_id);
  const diferenciaMarcada = Math.abs(totales.diferencia) > 0.1;
  const puedeConfirmar =
    !!draft.deposito_id &&
    recibidos.length > 0 &&
    !sinProductoRecibido.length &&
    (draft.permitir_parcial || !sinRecibir.length) &&
    (!diferenciaMarcada || draft.permitir_diferencia_total);

  function actualizar(patch: any) {
    setDraft((actual: any) => ({ ...actual, ...patch }));
  }

  function actualizarItem(index: number, patch: any) {
    setDraft((actual: any) => ({
      ...actual,
      items: actual.items.map((item: any, i: number) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function productoAItem(producto: any, cantidad = 1) {
    const iva = numero(producto.iva, 21);
    const costo = numero(producto.costo) || numero(producto.precio) / (1 + iva / 100);
    return {
      producto_id: producto.id,
      codigo: producto.codigo || "",
      codigo_barra: producto.codigoBarra || producto.codigo_barra || "",
      descripcion: producto.descripcion || "",
      codigo_proveedor: "",
      cantidad_facturada: cantidad,
      cantidad_recibida: cantidad,
      unidad: producto.unidad || "UN",
      costo_unitario: costo,
      descuento: 0,
      iva,
      precio_venta_actual: numero(producto.precio),
      precio_venta_nuevo: null,
      precio_venta_manual: false,
      revisar: false,
      confianza: "",
      diferencia_motivo: "",
      estado_identificacion: "IDENTIFICADO",
    };
  }

  function agregarProducto(producto: any) {
    if (draft.estado !== "BORRADOR") return;
    const existe = (draft.items || []).find((item: any) => Number(item.producto_id) === Number(producto.id));
    if (existe) {
      actualizarItem(
        draft.items.indexOf(existe),
        {
          cantidad_facturada: numero(existe.cantidad_facturada) + 1,
          cantidad_recibida: numero(existe.cantidad_recibida) + 1,
        },
      );
    } else {
      setDraft((actual: any) => ({ ...actual, items: [...actual.items, productoAItem(producto)] }));
    }
    setSeleccion((draft.items || []).length);
    setManualQuery("");
    setManualResults([]);
  }

  async function buscarManual() {
    if (!manualQuery.trim()) {
      setManualResults([]);
      return;
    }
    setManualLoading(true);
    try {
      const r = await api.listProducts(manualQuery.trim());
      setManualResults((r.products || []).slice(0, 12));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setManualLoading(false);
    }
  }

  async function escanearCodigo() {
    const codigo = barcode.trim();
    if (!codigo) return;
    setBarcode("");
    setError("");
    try {
      const r = await api.listProducts(codigo);
      const productos = r.products || [];
      const exacto = productos.find(
        (p: any) =>
          String(p.codigo || "") === codigo ||
          String(p.codigoBarra || p.codigo_barra || "") === codigo ||
          (p.codigosBarras || []).some((b: any) => String(b.codigoBarra || b.codigo_barra) === codigo),
      );
      if (!exacto) {
        setError(`No encontré un producto con el código ${codigo}. Podés crearlo desde Asignar.`);
        return;
      }
      const indice =
        seleccion != null && draft.items[seleccion] && !draft.items[seleccion].producto_id
          ? seleccion
          : (draft.items || []).findIndex((item: any) => !item.producto_id);
      if (indice >= 0) {
        asignarProducto(indice, exacto);
      } else {
        agregarProducto(exacto);
      }
      setAviso(`Código ${codigo}: ${exacto.descripcion}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function asignarProducto(index: number, producto: any) {
    const item = draft.items[index];
    if (!item) return;
    const iva = numero(producto.iva, 21);
    const costo = numero(producto.costo) || numero(item.costo_unitario) || numero(producto.precio) / (1 + iva / 100);
    actualizarItem(index, {
      producto_id: producto.id,
      codigo: producto.codigo || item.codigo || "",
      codigo_barra: producto.codigoBarra || producto.codigo_barra || item.codigo_barra || "",
      descripcion: item.descripcion || producto.descripcion || "",
      unidad: producto.unidad || item.unidad || "UN",
      costo_unitario: costo || item.costo_unitario || 0,
      iva: item.iva || iva,
      precio_venta_actual: numero(producto.precio),
      precio_venta_nuevo: null,
      precio_venta_manual: false,
      revisar: false,
      estado_identificacion: "IDENTIFICADO",
    });
    setAssignIndex(null);
    setAssignQuery("");
    setAssignResults([]);
  }

  async function abrirAsignacion(index: number) {
    const item = draft.items[index];
    if (!item) return;
    setAssignIndex(index);
    const q = String(item.codigo_barra || item.codigo || item.descripcion || "").trim();
    setAssignQuery(q);
    setNuevoProducto({
      descripcion: item.descripcion || "",
      codigo: item.codigo || "",
      codigoBarra: item.codigo_barra || "",
      iva: numero(item.iva, 21),
      precio: itemCalculado(item).precioSugerido,
      costo: itemCalculado(item).neto,
      unidad: item.unidad || "UN",
    });
    await buscarAsignacion(q);
  }

  async function buscarAsignacion(q = assignQuery) {
    setAssignLoading(true);
    try {
      const r = await api.listProducts(q || "");
      setAssignResults((r.products || []).slice(0, 20));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAssignLoading(false);
    }
  }

  async function crearYAsignar() {
    if (assignIndex == null) return;
    if (!String(nuevoProducto.descripcion || "").trim()) {
      setError("Completá la descripción del producto nuevo.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await api.createProduct({
        descripcion: nuevoProducto.descripcion,
        codigo: nuevoProducto.codigo || undefined,
        codigoBarra: nuevoProducto.codigoBarra || undefined,
        iva: numero(nuevoProducto.iva, 21),
        precio: numero(nuevoProducto.precio),
        costo: numero(nuevoProducto.costo),
        unidad: nuevoProducto.unidad || "UN",
      });
      asignarProducto(assignIndex, r.product);
      setAviso(`Producto creado: ${r.product.descripcion}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function buscarProveedores() {
    try {
      const r = await api.receptionSuppliers(proveedorQuery);
      setProveedores(r.proveedores || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function elegirProveedor(proveedor: any) {
    actualizar({
      proveedor_id: proveedor.id,
      proveedor_nombre: proveedor.nombre,
      proveedor_documento: proveedor.cuit || "",
      proveedor_condicion_iva: proveedor.condicion_iva || "",
      proveedor_domicilio: proveedor.domicilio || "",
    });
    setProveedores([]);
    setProveedorQuery("");
  }

  async function subirOcr() {
    if (!file) {
      setError("Elegí una foto o PDF del comprobante.");
      return;
    }
    setOcrLoading(true);
    setError("");
    setAviso("");
    try {
      const r = await api.receptionOcr(file, {
        uuid: draft.id ? nuevoUuid() : draft.uuid,
        deposito_id: draft.deposito_id,
        crear_factura: draft.crear_factura ? 1 : 0,
        actualizar_costo: draft.actualizar_costo ? 1 : 0,
        actualizar_precio: draft.actualizar_precio ? 1 : 0,
        margen_porcentaje: draft.margen_porcentaje,
        permitir_parcial: draft.permitir_parcial ? 1 : 0,
        permitir_diferencia_total: draft.permitir_diferencia_total ? 1 : 0,
      });
      setDraft(r.recepcion);
      setFile(null);
      setSeleccion(null);
      const faltantes = r.ocr?.faltantes || [];
      setAviso(
        faltantes.length
          ? `Lectura completa. Revisá: ${faltantes.join(", ")}.`
          : "Lectura completa. Revisá los renglones antes de confirmar.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcrLoading(false);
    }
  }

  function payload() {
    return {
      ...draft,
      id: undefined,
      items: (draft.items || []).map((item: any) => ({
        producto_id: item.producto_id || null,
        codigo: item.codigo,
        codigo_barra: item.codigo_barra,
        descripcion: item.descripcion,
        codigo_proveedor: item.codigo_proveedor,
        cantidad_facturada: numero(item.cantidad_facturada),
        cantidad_recibida: numero(item.cantidad_recibida),
        unidad: item.unidad,
        costo_unitario: numero(item.costo_unitario),
        descuento: numero(item.descuento),
        iva: numero(item.iva, 21),
        precio_venta_nuevo:
          item.precio_venta_nuevo === "" || item.precio_venta_nuevo == null
            ? null
            : numero(item.precio_venta_nuevo),
        precio_venta_manual: !!item.precio_venta_manual,
        diferencia_motivo: item.diferencia_motivo,
        revisar: !!item.revisar,
        confianza: item.confianza,
      })),
      total_documento: numero(draft.total_documento),
      subtotal: totales.subtotal,
      iva: totales.iva,
      total: totales.total,
      diferencia_total: totales.diferencia,
    };
  }

  async function guardar(silencioso = false) {
    setSaving(true);
    setError("");
    try {
      const r = draft.id
        ? await api.saveReception(draft.id, payload())
        : await api.createReception(payload());
      setDraft(r.recepcion);
      await cargarRecientes();
      if (!silencioso) setAviso("Borrador guardado.");
      return r.recepcion;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function confirmarRecepcion() {
    setConfirmando(true);
    setError("");
    try {
      const guardada = await guardar(true);
      const r = await api.confirmReception(guardada.id);
      setDraft(r.recepcion);
      setConfirmando(false);
      setResultado(r);
      await cargarRecientes();
    } catch (e) {
      setConfirmando(false);
      setError((e as Error).message);
    } finally {
      setConfirmando(false);
    }
  }

  async function anular() {
    if (!draft.id || !window.confirm("¿Anular esta recepción en borrador?")) return;
    setSaving(true);
    try {
      const r = await api.cancelReception(draft.id);
      setDraft(r.recepcion);
      setAviso("Recepción anulada.");
      await cargarRecientes();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function abrirRecepcion(id: number) {
    setSaving(true);
    setError("");
    try {
      const r = await api.getReception(id);
      setDraft(r.recepcion);
      setSeleccion(null);
      setResultado(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function nuevaRecepcion() {
    const nueva = nuevoBorrador();
    nueva.deposito_id = depositos[0]?.id || 0;
    setDraft(nueva);
    setFile(null);
    setSeleccion(null);
    setResultado(null);
    setError("");
    setAviso("");
  }

  const itemsVisibles = (draft.items || [])
    .map((item: any, index: number) => ({ item, index }))
    .filter(({ item }: any) => !filtroPendientes || !item.producto_id);

  const bloqueado = saving || ocrLoading || draft.estado !== "BORRADOR";

  return (
    <div className="reception-page">
      <div className="reception-hero">
        <div>
          <span className="reception-eyebrow">COMPRAS · STOCK · PRECIOS</span>
          <h3>Recibir productos</h3>
          <p>
            Cargá la factura o lista a mano, asociá los artículos y confirmá. El stock y los
            precios recién se actualizan al confirmar.
          </p>
        </div>
        <div className="reception-hero-actions">
          <button className="secondary" onClick={nuevaRecepcion} disabled={saving || ocrLoading}>
            <Plus size={16} /> Nueva
          </button>
          <button className="secondary" onClick={() => guardar()} disabled={bloqueado || !(draft.items || []).length}>
            <Save size={16} /> Guardar borrador
          </button>
          <button
            className="primary"
            onClick={() => setConfirmando(true)}
            disabled={bloqueado || !puedeConfirmar}
          >
            <Check size={17} /> Confirmar recepción
          </button>
        </div>
      </div>

      {error && (
        <div className="reception-alert danger">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError("")}><X size={15} /></button>
        </div>
      )}
      {aviso && !error && (
        <div className="reception-alert success">
          <Check size={17} />
          <span>{aviso}</span>
          <button className="icon-button" onClick={() => setAviso("")}><X size={15} /></button>
        </div>
      )}

      {recientes.length > 0 && (
        <details className="reception-recent">
          <summary>Recepciones recientes ({recientes.length})</summary>
          <div className="reception-recent-list">
            {recientes.map((r: any) => (
              <button key={r.id} onClick={() => abrirRecepcion(r.id)}>
                <span>
                  <b>{r.proveedor_nombre || "Sin proveedor"}</b>
                  <small>
                    {r.tipo_comprobante || "Comprobante"} {r.numero || "s/n"} · {r.fecha}
                  </small>
                </span>
                <span className={`reception-badge ${estadoBadge(r.estado)}`}>{r.estado}</span>
                <strong>{dinero(r.total)}</strong>
              </button>
            ))}
          </div>
        </details>
      )}

      {draft.estado !== "BORRADOR" && (
        <div className="reception-alert info">
          Esta recepción está {draft.estado.toLowerCase()}. Creá una nueva para seguir operando.
        </div>
      )}

      <div className="reception-layout">
        <main>
          <section className="card reception-card">
            <div className="reception-card-head">
              <div>
                <h4>1. Comprobante y depósito</h4>
                <span>Los datos fiscales son opcionales si no generás la compra.</span>
              </div>
              <span className={`reception-badge ${estadoBadge(draft.estado)}`}>{draft.estado}</span>
            </div>

            <div className="reception-form-grid">
              <label>
                Depósito de ingreso *
                <select
                  value={draft.deposito_id || ""}
                  onChange={(e) => actualizar({ deposito_id: Number(e.target.value) })}
                  disabled={bloqueado}
                >
                  <option value="">Elegir depósito</option>
                  {depositos.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </label>
              <label>
                Fecha
                <input type="date" value={draft.fecha || ""} onChange={(e) => actualizar({ fecha: e.target.value })} disabled={bloqueado} />
              </label>
              <label>
                Tipo de comprobante
                <select value={draft.tipo_comprobante || ""} onChange={(e) => actualizar({ tipo_comprobante: e.target.value })} disabled={bloqueado}>
                  <option value="FACTURA">Factura</option>
                  <option value="NOTA DE CREDITO">Nota de crédito</option>
                  <option value="NOTA DE DEBITO">Nota de débito</option>
                  <option value="REMITO">Remito</option>
                  <option value="LISTA DE PRECIOS">Lista de precios</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>
              <label>
                Letra
                <select value={draft.letra || ""} onChange={(e) => actualizar({ letra: e.target.value })} disabled={bloqueado}>
                  <option value="">Sin letra</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </label>
              <label>
                Punto de venta
                <input type="number" min="0" value={draft.punto_venta ?? ""} onChange={(e) => actualizar({ punto_venta: e.target.value })} disabled={bloqueado} />
              </label>
              <label>
                Número
                <input value={draft.numero || ""} onChange={(e) => actualizar({ numero: e.target.value })} placeholder="0001-00001234" disabled={bloqueado} />
              </label>
            </div>

            <div className="reception-provider-row">
              <label>
                Proveedor
                <input value={draft.proveedor_nombre || ""} onChange={(e) => actualizar({ proveedor_nombre: e.target.value })} placeholder="Nombre o razón social" disabled={bloqueado} />
              </label>
              <label>
                CUIT
                <input value={draft.proveedor_documento || ""} onChange={(e) => actualizar({ proveedor_documento: e.target.value })} placeholder="20-12345678-9" disabled={bloqueado} />
              </label>
              <div className="reception-inline-search">
                <input
                  value={proveedorQuery}
                  onChange={(e) => setProveedorQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") buscarProveedores(); }}
                  placeholder="Buscar proveedor..."
                  disabled={bloqueado}
                />
                <button className="secondary" onClick={buscarProveedores} disabled={bloqueado}>
                  <Search size={15} />
                </button>
              </div>
            </div>
            {proveedores.length > 0 && (
              <div className="reception-search-results">
                {proveedores.map((p: any) => (
                  <button key={p.id} onClick={() => elegirProveedor(p)}>
                    <b>{p.nombre}</b>
                    <small>{p.cuit || "Sin CUIT"} · {p.condicion_iva || "Sin condición"}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="reception-options">
              <label className="check">
                <input type="checkbox" checked={!!draft.crear_factura} onChange={(e) => actualizar({ crear_factura: e.target.checked })} disabled={bloqueado} />
                Generar factura de compra
              </label>
              <label className="check">
                <input type="checkbox" checked={!!draft.actualizar_costo} onChange={(e) => actualizar({ actualizar_costo: e.target.checked })} disabled={bloqueado} />
                Actualizar costo
              </label>
              <label className="check">
                <input type="checkbox" checked={!!draft.actualizar_precio} onChange={(e) => actualizar({ actualizar_precio: e.target.checked })} disabled={bloqueado} />
                Actualizar precio de venta
              </label>
              <label className="check">
                <input type="checkbox" checked={!!draft.costo_incluye_iva} onChange={(e) => actualizar({ costo_incluye_iva: e.target.checked })} disabled={bloqueado} />
                El costo cargado incluye IVA
              </label>
              <label className="check">
                <input type="checkbox" checked={!!draft.permitir_parcial} onChange={(e) => actualizar({ permitir_parcial: e.target.checked })} disabled={bloqueado} />
                Permitir recepción parcial
              </label>
              <label className="check">
                <input type="checkbox" checked={!!draft.permitir_diferencia_total} onChange={(e) => actualizar({ permitir_diferencia_total: e.target.checked })} disabled={bloqueado} />
                Permitir diferencia de total
              </label>
              <label className="reception-margin">
                Margen para precio nuevo
                <span>
                  <input type="number" value={draft.margen_porcentaje ?? 0} onChange={(e) => actualizar({ margen_porcentaje: e.target.value })} disabled={bloqueado} /> %
                </span>
              </label>
              <label className="reception-margin">
                Exento / no gravado
                <input type="number" step="0.01" value={draft.exento_no_gravado ?? 0} onChange={(e) => actualizar({ exento_no_gravado: e.target.value })} disabled={bloqueado} />
              </label>
              <label className="reception-margin">
                Percepciones
                <input type="number" step="0.01" value={draft.percepciones ?? 0} onChange={(e) => actualizar({ percepciones: e.target.value })} disabled={bloqueado} />
              </label>
              <label className="reception-margin">
                Total del documento
                <input type="number" step="0.01" value={draft.total_documento ?? 0} onChange={(e) => actualizar({ total_documento: e.target.value })} disabled={bloqueado} />
              </label>
            </div>
          </section>

          <section className="card reception-card">
            <div className="reception-card-head">
              <div>
                <h4>2. Cargar comprobante o renglones</h4>
                <span>Foto/PDF para leer con OCR o buscá los productos a mano.</span>
              </div>
              <span className="reception-counter">
                {recibidos.length} recibidos · {pendientes.length} sin producto
              </span>
            </div>

            <div className="reception-upload-row">
              <label className="reception-file">
                <Upload size={18} />
                <span>{file ? file.name : "Elegir foto o PDF (hasta 10 MB)"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={bloqueado}
                />
              </label>
              <button className="secondary" onClick={subirOcr} disabled={bloqueado || !file}>
                {ocrLoading ? <RefreshCw className="spin" size={16} /> : <PackageCheck size={16} />}
                {ocrLoading ? "Leyendo..." : "Leer con OCR"}
              </button>
            </div>
            <p className="reception-hint">
              El OCR no inventa datos: los renglones dudosos quedan marcados para revisar. Si el PDF
              es una foto escaneada, subí una imagen JPG/PNG.
            </p>

            <div className="reception-add-row">
              <div className="reception-inline-search">
                <input
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") buscarManual(); }}
                  placeholder="Buscar producto por código o descripción..."
                  disabled={bloqueado}
                />
                <button className="secondary" onClick={buscarManual} disabled={bloqueado || manualLoading}>
                  {manualLoading ? <RefreshCw className="spin" size={15} /> : <Search size={15} />}
                </button>
              </div>
              <div className="reception-barcode">
                <Barcode size={18} />
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") escanearCodigo(); }}
                  placeholder="Escaneá un código y Enter"
                  disabled={bloqueado}
                />
              </div>
            </div>
            {manualResults.length > 0 && (
              <div className="reception-search-results">
                {manualResults.map((p: any) => (
                  <button key={p.id} onClick={() => agregarProducto(p)}>
                    <b>{p.descripcion}</b>
                    <small>{p.codigo || "Sin código"} · {p.codigoBarra || "Sin barra"} · {dinero(p.precio)}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="reception-table-tools">
              <label className="check">
                <input type="checkbox" checked={filtroPendientes} onChange={(e) => setFiltroPendientes(e.target.checked)} />
                Ver solo sin producto
              </label>
              <span>{itemsVisibles.length} renglón(es)</span>
            </div>

            <div className="reception-table-wrap">
              <table className="reception-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Producto / descripción</th>
                    <th>Código</th>
                    <th>Cód. proveedor</th>
                    <th>Fact.</th>
                    <th>Recib.</th>
                    <th>Costo</th>
                    <th>Desc. %</th>
                    <th>IVA %</th>
                    <th>Stock</th>
                    <th>Precio actual</th>
                    <th>Precio nuevo</th>
                    <th>Importe</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {itemsVisibles.length === 0 && (
                    <tr>
                      <td colSpan={14}>
                        <div className="reception-empty">
                          <PackagePlus size={28} />
                          <b>No hay renglones todavía</b>
                          <span>Subí un comprobante o buscá un producto para agregarlo.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {itemsVisibles.map(({ item, index }: any) => {
                    const calculo = itemCalculado(item);
                    const sugerido = item.precio_venta_nuevo ?? "";
                    return (
                      <tr
                        key={index}
                        className={seleccion === index ? "selected" : ""}
                        onClick={() => setSeleccion(index)}
                      >
                        <td className="reception-line">{index + 1}</td>
                        <td>
                          <div className="reception-product-cell">
                            <input
                              value={item.descripcion || ""}
                              onChange={(e) => actualizarItem(index, { descripcion: e.target.value })}
                              placeholder="Descripción"
                              disabled={bloqueado}
                            />
                            <div className="reception-product-actions">
                              {item.producto_id ? (
                                <span className="reception-matched">
                                  <Check size={13} /> Producto asignado
                                </span>
                              ) : (
                                <span className="reception-unmatched">
                                  <AlertTriangle size={13} /> Sin producto
                                </span>
                              )}
                              <button className="link-button" onClick={(e) => { e.stopPropagation(); abrirAsignacion(index); }} disabled={bloqueado}>
                                {item.producto_id ? "Cambiar" : "Asignar"}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td>
                          <input className="reception-code" value={item.codigo || ""} onChange={(e) => actualizarItem(index, { codigo: e.target.value })} disabled={bloqueado} />
                          <input className="reception-code" value={item.codigo_barra || ""} onChange={(e) => actualizarItem(index, { codigo_barra: e.target.value })} placeholder="Barra" disabled={bloqueado} />
                        </td>
                        <td>
                          <input className="reception-code" value={item.codigo_proveedor || ""} onChange={(e) => actualizarItem(index, { codigo_proveedor: e.target.value })} disabled={bloqueado} />
                        </td>
                        <td>
                          <input className="reception-qty" type="number" min="0" step="0.01" value={item.cantidad_facturada ?? 0} onChange={(e) => actualizarItem(index, { cantidad_facturada: e.target.value })} disabled={bloqueado} />
                        </td>
                        <td>
                          <input className="reception-qty received" type="number" min="0" step="0.01" value={item.cantidad_recibida ?? 0} onChange={(e) => actualizarItem(index, { cantidad_recibida: e.target.value })} disabled={bloqueado} />
                        </td>
                        <td>
                          <input className="reception-money" type="number" min="0" step="0.01" value={item.costo_unitario ?? 0} onChange={(e) => actualizarItem(index, { costo_unitario: e.target.value })} disabled={bloqueado} />
                        </td>
                        <td>
                          <input className="reception-small" type="number" min="0" step="0.01" value={item.descuento ?? 0} onChange={(e) => actualizarItem(index, { descuento: e.target.value })} disabled={bloqueado} />
                        </td>
                        <td>
                          <input className="reception-small" type="number" min="0" step="0.01" value={item.iva ?? 21} onChange={(e) => actualizarItem(index, { iva: e.target.value })} disabled={bloqueado} />
                        </td>
                        <td className="reception-number">{numero(item.stock_actual).toLocaleString("es-AR")}</td>
                        <td className="reception-number">{dinero(item.precio_venta_actual)}</td>
                        <td>
                          <input
                            className="reception-money"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={String(calculo.precioSugerido || "")}
                            value={sugerido}
                            onChange={(e) => actualizarItem(index, { precio_venta_nuevo: e.target.value, precio_venta_manual: e.target.value !== "" })}
                            disabled={bloqueado || !draft.actualizar_precio}
                          />
                        </td>
                        <td className="reception-number strong">{dinero(calculo.importe)}</td>
                        <td>
                          <button className="icon-button danger" onClick={(e) => { e.stopPropagation(); setDraft((actual: any) => ({ ...actual, items: actual.items.filter((_: any, i: number) => i !== index) })); }} disabled={bloqueado}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="reception-totals">
              <span>Subtotal <b>{dinero(totales.subtotal)}</b></span>
              <span>IVA <b>{dinero(totales.iva)}</b></span>
              <span>Total calculado <b>{dinero(totales.total)}</b></span>
              <span className={diferenciaMarcada ? "reception-diff" : ""}>
                Diferencia con documento <b>{dinero(totales.diferencia)}</b>
              </span>
            </div>
            {pendientes.length > 0 && (
              <p className="reception-hint warning">
                {pendientes.length} renglón(es) sin producto. Asignalos antes de confirmar.
              </p>
            )}
            {diferenciaMarcada && !draft.permitir_diferencia_total && (
              <p className="reception-hint warning">
                El total no coincide. Revisá cantidades/costos o activá "Permitir diferencia de total".
              </p>
            )}
          </section>

          <section className="card reception-card">
            <div className="reception-card-head">
              <div>
                <h4>Observaciones</h4>
                <span>Quedan guardadas en la recepción y en la compra.</span>
              </div>
            </div>
            <textarea
              rows={3}
              value={draft.observaciones || ""}
              onChange={(e) => actualizar({ observaciones: e.target.value })}
              disabled={bloqueado}
              placeholder="Ej.: faltó mercadería, entrega parcial, diferencia de precio acordada..."
            />
          </section>
        </main>

        <aside className="reception-side">
          <section className="card reception-summary">
            <h4>Resumen de la recepción</h4>
            <dl>
              <div><dt>Proveedor</dt><dd>{draft.proveedor_nombre || "Sin definir"}</dd></div>
              <div><dt>Comprobante</dt><dd>{draft.tipo_comprobante || "—"} {draft.letra || ""} {draft.punto_venta || ""}-{draft.numero || "s/n"}</dd></div>
              <div><dt>Depósito</dt><dd>{depositos.find((d: any) => Number(d.id) === Number(draft.deposito_id))?.nombre || "Sin definir"}</dd></div>
              <div><dt>Renglones</dt><dd>{(draft.items || []).length}</dd></div>
              <div><dt>Identificados</dt><dd>{recibidos.filter((i: any) => i.producto_id).length}</dd></div>
              <div><dt>Total</dt><dd className="strong">{dinero(totales.total)}</dd></div>
            </dl>
            <div className="reception-side-actions">
              <button className="secondary" onClick={() => guardar()} disabled={bloqueado || !(draft.items || []).length}>
                <Save size={15} /> Guardar
              </button>
              {draft.id && draft.estado === "BORRADOR" && (
                <button className="danger-outline" onClick={anular} disabled={saving}>
                  Anular borrador
                </button>
              )}
            </div>
          </section>
          <section className="card reception-summary">
            <h4>Qué se actualiza al confirmar</h4>
            <ul className="reception-checks">
              <li className={draft.crear_factura ? "on" : ""}>Compra en Libro IVA {draft.crear_factura ? "sí" : "no"}</li>
              <li className={draft.actualizar_costo ? "on" : ""}>Costo del producto {draft.actualizar_costo ? "sí" : "no"}</li>
              <li className={draft.actualizar_precio ? "on" : ""}>Precio de venta {draft.actualizar_precio ? "sí" : "no"}</li>
              <li className="on">Stock en {depositos.find((d: any) => Number(d.id) === Number(draft.deposito_id))?.nombre || "el depósito"}</li>
              <li className="on">Código de proveedor para futuras lecturas</li>
            </ul>
          </section>
        </aside>
      </div>

      {assignIndex != null && (
        <div className="reception-modal-backdrop" onClick={() => setAssignIndex(null)}>
          <div className="reception-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reception-modal-head">
              <div>
                <h3>Asignar producto</h3>
                <p>Buscá por código, código de barras o descripción.</p>
              </div>
              <button className="icon-button" onClick={() => setAssignIndex(null)}><X size={18} /></button>
            </div>
            <div className="reception-inline-search">
              <input
                autoFocus
                value={assignQuery}
                onChange={(e) => setAssignQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") buscarAsignacion(); }}
                placeholder="Código o descripción..."
              />
              <button className="secondary" onClick={() => buscarAsignacion()} disabled={assignLoading}>
                {assignLoading ? <RefreshCw className="spin" size={15} /> : <Search size={15} />}
              </button>
            </div>
            <div className="reception-assign-list">
              {assignResults.map((p: any) => (
                <button key={p.id} onClick={() => asignarProducto(assignIndex, p)}>
                  <span>
                    <b>{p.descripcion}</b>
                    <small>{p.codigo || "Sin código"} · {p.codigoBarra || "Sin barra"}</small>
                  </span>
                  <strong>{dinero(p.precio)}</strong>
                </button>
              ))}
              {!assignResults.length && !assignLoading && (
                <p className="reception-hint">No encontré coincidencias. Podés crear el producto acá abajo.</p>
              )}
            </div>
            <div className="reception-new-product">
              <h4>Crear producto y asignarlo</h4>
              <div className="reception-form-grid compact">
                <label>Descripción<input value={nuevoProducto.descripcion || ""} onChange={(e) => setNuevoProducto({ ...nuevoProducto, descripcion: e.target.value })} /></label>
                <label>Código<input value={nuevoProducto.codigo || ""} onChange={(e) => setNuevoProducto({ ...nuevoProducto, codigo: e.target.value })} /></label>
                <label>Código de barras<input value={nuevoProducto.codigoBarra || ""} onChange={(e) => setNuevoProducto({ ...nuevoProducto, codigoBarra: e.target.value })} /></label>
                <label>Costo neto<input type="number" step="0.01" value={nuevoProducto.costo ?? 0} onChange={(e) => setNuevoProducto({ ...nuevoProducto, costo: e.target.value })} /></label>
                <label>IVA %<input type="number" step="0.01" value={nuevoProducto.iva ?? 21} onChange={(e) => setNuevoProducto({ ...nuevoProducto, iva: e.target.value })} /></label>
                <label>Precio final<input type="number" step="0.01" value={nuevoProducto.precio ?? 0} onChange={(e) => setNuevoProducto({ ...nuevoProducto, precio: e.target.value })} /></label>
              </div>
              <div className="reception-modal-actions">
                <button className="secondary" onClick={() => setAssignIndex(null)}>Cancelar</button>
                <button className="primary" onClick={crearYAsignar} disabled={saving}>
                  <PackagePlus size={16} /> Crear y asignar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmando && (
        <div className="reception-modal-backdrop" onClick={() => !saving && setConfirmando(false)}>
          <div className="reception-modal small" onClick={(e) => e.stopPropagation()}>
            <div className="reception-modal-head">
              <div>
                <h3>Confirmar recepción</h3>
                <p>Esta acción mueve stock y no se puede deshacer desde acá.</p>
              </div>
              <button className="icon-button" onClick={() => !saving && setConfirmando(false)}><X size={18} /></button>
            </div>
            <div className="reception-confirm-summary">
              <div><span>Renglones recibidos</span><b>{recibidos.length}</b></div>
              <div><span>Total</span><b>{dinero(totales.total)}</b></div>
              <div><span>Depósito</span><b>{depositos.find((d: any) => Number(d.id) === Number(draft.deposito_id))?.nombre || "—"}</b></div>
              <div><span>Factura de compra</span><b>{draft.crear_factura ? "Sí" : "No"}</b></div>
              <div><span>Actualizar costo</span><b>{draft.actualizar_costo ? "Sí" : "No"}</b></div>
              <div><span>Actualizar precio</span><b>{draft.actualizar_precio ? "Sí" : "No"}</b></div>
            </div>
            {sinRecibir.length > 0 && (
              <p className="reception-hint warning">Se recibirán {recibidos.length} de {(draft.items || []).length} renglones (parcial).</p>
            )}
            {diferenciaMarcada && (
              <p className="reception-hint warning">Diferencia con el documento: {dinero(totales.diferencia)}.</p>
            )}
            <div className="reception-modal-actions">
              <button className="secondary" onClick={() => setConfirmando(false)} disabled={saving}>Volver</button>
              <button className="primary" onClick={confirmarRecepcion} disabled={saving || !puedeConfirmar}>
                {saving ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}
                {saving ? "Confirmando..." : "Confirmar y mover stock"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resultado && (
        <div className="reception-modal-backdrop" onClick={() => setResultado(null)}>
          <div className="reception-modal small" onClick={(e) => e.stopPropagation()}>
            <div className="reception-modal-head">
              <div>
                <h3>Recepción confirmada</h3>
                <p>El stock y los datos relacionados ya quedaron actualizados.</p>
              </div>
              <button className="icon-button" onClick={() => setResultado(null)}><X size={18} /></button>
            </div>
            <div className="reception-result">
              <div className="reception-result-icon"><Check size={28} /></div>
              <div>
                <b>{resultado.recepcion?.proveedor_nombre || "Recepción"} #{resultado.recepcion?.id}</b>
                <span>{resultado.movimientos?.length || 0} movimiento(s) de stock · {resultado.actualizaciones?.length || 0} producto(s) actualizados</span>
                {resultado.compra_id && <span>Compra generada #{resultado.compra_id}</span>}
              </div>
            </div>
            {resultado.advertencias?.length > 0 && (
              <div className="reception-alert warning">
                <AlertTriangle size={16} />
                <span>{resultado.advertencias.join(" ")}</span>
              </div>
            )}
            <div className="reception-modal-actions">
              <button className="primary" onClick={() => { setResultado(null); nuevaRecepcion(); }}>Nueva recepción</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
