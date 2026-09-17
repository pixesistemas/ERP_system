import { X, Printer } from "lucide-react";

export function PdfViewerModal({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  return <div className="modal-backdrop"><div className="modal pdf-viewer-modal">
    <div className="modal-head">
      <div><h3>{title || "Comprobante PDF"}</h3><p>Vista previa del PDF para imprimir sin salir del sistema.</p></div>
      <button type="button" onClick={onClose}><X /></button>
    </div>
    <iframe title={title || "Comprobante PDF"} src={url} className="pdf-viewer-frame" />
    <div className="modal-actions">
      <button type="button" onClick={onClose}>Cerrar</button>
      <button className="primary-action" onClick={() => { const w = window.open(url, "_blank"); if (w) w.focus(); }}><Printer size={16} /> Imprimir / abrir aparte</button>
    </div>
  </div></div>;
}
