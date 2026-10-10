import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

/*
 * Editor de multipagos para las apps móviles (vendedor y repartidor).
 *
 * El cliente puede entregar una mezcla de efectivo, transferencias y varios
 * cheques: cada pago se agrega a la lista y queda PENDIENTE hasta que la
 * oficina lo confirme (ahí va a cuenta corriente y se genera el recibo).
 */

export type Pago = {
  medio: string;
  importe: number;
  banco?: string;
  numero?: string;
  librador?: string;
  vencimiento?: string;
  foto?: string;
};

export const MEDIOS_PAGO = [
  { valor: "EFECTIVO", label: "Efectivo" },
  { valor: "TRANSFERENCIA", label: "Transferencia" },
  { valor: "CHEQUE", label: "Cheque" },
];

export function parseImporte(texto: string): number {
  const limpio = String(texto || "")
    .replace(/\./g, "")
    .replace(/[^\d,]/g, "")
    .replace(",", ".");
  return Number(limpio) || 0;
}

export function formatearMientrasEscribe(texto: string): string {
  const limpio = String(texto || "").replace(/[^\d,]/g, "");
  const [entera, decimal] = limpio.split(",");
  const enteraFmt = entera ? Number(entera).toLocaleString("es-AR") : "";
  if (decimal !== undefined) return `${enteraFmt},${decimal.slice(0, 2)}`;
  return enteraFmt;
}

export function fmtMoneda(n: any): string {
  return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function descripcionPago(p: Pago): string {
  if (p.medio === "CHEQUE") {
    return `Cheque ${p.numero || "s/n"}${p.banco ? ` · ${p.banco}` : ""}${p.librador ? ` · ${p.librador}` : ""}${p.vencimiento ? ` · vence ${p.vencimiento}` : ""}`;
  }
  if (p.medio === "TRANSFERENCIA" && p.banco) return `Transferencia · ${p.banco}`;
  return p.medio;
}

export function PagosEditor({ pagos, setPagos, onDraftChange, resetSignal }: { pagos: Pago[]; setPagos: (p: Pago[]) => void; onDraftChange?: (pago: Pago | null) => void; resetSignal?: number }) {
  const [medio, setMedio] = useState("EFECTIVO");
  const [importe, setImporte] = useState("");
  const [banco, setBanco] = useState("");
  const [numero, setNumero] = useState("");
  const [librador, setLibrador] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [foto, setFoto] = useState("");
  const [errorLocal, setErrorLocal] = useState("");

  /*
   * Si el usuario completa el importe y se olvida de tocar "Agregar pago",
   * el pago se incluye igual al enviar el pedido: el borrador se informa
   * al componente padre con onDraftChange.
   */
  useEffect(() => {
    const valor = parseImporte(importe);
    if (!(valor > 0)) {
      onDraftChange?.(null);
      return;
    }
    if (medio === "CHEQUE" && !numero.trim()) {
      onDraftChange?.(null);
      return;
    }
    const pago: Pago = { medio, importe: valor };
    if (medio === "TRANSFERENCIA") pago.banco = banco.trim() || undefined;
    if (medio === "CHEQUE") {
      pago.banco = banco.trim() || undefined;
      pago.numero = numero.trim();
      pago.librador = librador.trim() || undefined;
      pago.vencimiento = vencimiento || undefined;
      pago.foto = foto || undefined;
    }
    onDraftChange?.(pago);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medio, importe, banco, numero, librador, vencimiento, foto]);

  useEffect(() => {
    if (!resetSignal) return;
    setImporte("");
    setNumero("");
    setLibrador("");
    setVencimiento("");
    setFoto("");
    setErrorLocal("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  function onFoto(e: any) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) {
      setErrorLocal("La foto es muy grande (máximo 3 MB). Sacala de nuevo con menos calidad.");
      return;
    }
    const lector = new FileReader();
    lector.onload = () => setFoto(String(lector.result || ""));
    lector.readAsDataURL(f);
  }

  function agregar() {
    const valor = parseImporte(importe);
    if (!(valor > 0)) return setErrorLocal("Ingresá el importe del pago.");
    if (medio === "CHEQUE" && !numero.trim()) return setErrorLocal("Completá el número del cheque.");
    const pago: Pago = { medio, importe: valor };
    if (medio === "TRANSFERENCIA") pago.banco = banco.trim() || undefined;
    if (medio === "CHEQUE") {
      pago.banco = banco.trim() || undefined;
      pago.numero = numero.trim();
      pago.librador = librador.trim() || undefined;
      pago.vencimiento = vencimiento || undefined;
      pago.foto = foto || undefined;
    }
    setPagos([...pagos, pago]);
    setImporte("");
    setNumero("");
    setLibrador("");
    setVencimiento("");
    setFoto("");
    setErrorLocal("");
  }

  function quitar(indice: number) {
    setPagos(pagos.filter((_, i) => i !== indice));
  }

  const total = pagos.reduce((n, p) => n + Number(p.importe || 0), 0);

  return <div className="mobile-pagos">
    <h4>¿Entrega dinero a cuenta?</h4>
    <p className="mobile-pagos-ayuda">Se pueden cargar varios pagos juntos: efectivo, transferencias y todos los cheques que quieras. Si completás un importe y no tocás "Agregar pago", se incluye igual al enviar.</p>
    <label className="mobile-obs">Forma de pago
      <select value={medio} onChange={(e) => setMedio(e.target.value)}>
        {MEDIOS_PAGO.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
      </select>
    </label>
    <label className="mobile-obs">Importe
      <input inputMode="decimal" value={importe} onChange={(e) => setImporte(formatearMientrasEscribe(e.target.value))} placeholder="Ej.: 150.000" />
    </label>
    {medio === "TRANSFERENCIA" && <label className="mobile-obs">Banco de la transferencia<input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Opcional" /></label>}
    {medio === "CHEQUE" && <>
      <label className="mobile-obs">N° de cheque<input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" /></label>
      <label className="mobile-obs">Banco<input value={banco} onChange={(e) => setBanco(e.target.value)} /></label>
      <label className="mobile-obs">Librador<input value={librador} onChange={(e) => setLibrador(e.target.value)} placeholder="Quién firma" /></label>
      <label className="mobile-obs">Vencimiento<input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} /></label>
      <label className="mobile-obs">Foto del cheque<input type="file" accept="image/*" capture="environment" onChange={onFoto} /></label>
      {foto && <img src={foto} alt="Cheque" className="mobile-cheque-foto" />}
    </>}
    {errorLocal && <div className="mobile-aviso">{errorLocal}</div>}
    {parseImporte(importe) > 0 && <div className="mobile-aviso">Se incluirá también al enviar: <strong>{medio} $ {fmtMoneda(parseImporte(importe))}</strong></div>}
    <button type="button" className="mobile-btn-sec full" onClick={agregar}><Plus size={16} /> Agregar pago</button>
    {pagos.length > 0 && <div className="mobile-pagos-lista">
      {pagos.map((p, i) => <div className="mobile-linea" key={i}>
        <div><strong>{p.medio}</strong><span>{descripcionPago(p)}</span></div>
        <b>$ {fmtMoneda(p.importe)}</b>
        <button type="button" onClick={() => quitar(i)}><Trash2 size={15} /></button>
      </div>)}
      <div className="mobile-total"><span>TOTAL A CUENTA</span><strong>$ {fmtMoneda(total)}</strong></div>
      <div className="mobile-aviso">Queda <strong>pendiente</strong> hasta que la oficina lo confirme: ahí va a la cuenta corriente y se genera el recibo oficial.</div>
    </div>}
  </div>;
}
