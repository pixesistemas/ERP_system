import { X, Printer } from "lucide-react";
import { normalizarUrlArchivo } from "../../services/api";

export function PdfViewerModal({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  /*
   * El backend puede devolver la URL del PDF como ruta relativa
   * ("/storage/pdf/..."); si el iframe la resuelve contra el frontend
   * termina mostrando la aplicación en lugar del PDF. Siempre se
   * normaliza contra el origen de la API.
   */
  const urlFinal = normalizarUrlArchivo(url);
  return <div className="modal-backdrop"><div className="modal pdf-viewer-modal">
    <div className="modal-head">
      <div><h3>{title || "Comprobante PDF"}</h3><p>Vista previa del PDF para imprimir sin salir del sistema.</p></div>
      <button type="button" onClick={onClose}><X /></button>
    </div>
    <iframe title={title || "Comprobante PDF"} src={urlFinal} className="pdf-viewer-frame" />
    <div className="modal-actions">
      <button type="button" onClick={onClose}>Cerrar</button>
      <button className="primary-action" onClick={() => { const w = window.open(urlFinal, "_blank"); if (w) w.focus(); }}><Printer size={16} /> Imprimir / abrir aparte</button>
    </div>
  </div></div>;
}
