export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; at: Date; response?: any };

export type Conversation = { id: number; telefono: string; estado: string; command?: any; updatedAt?: string };

export type Product = { id?: number; codigo: string; codigoBarra?: string; descripcion: string; precio: number; costo?: number; utilidad?: number; iva: number; unidad: string; activo?: boolean; updatedAt?: string; rubro?: string; subrubro?: string; marca?: string; rubroId?: number|string; subrubroId?: number|string; marcaId?: number|string; unidadId?: number|string };

export const emptyProduct: Product = { codigo: "", codigoBarra: "", descripcion: "", precio: 0, costo: 0, utilidad: 0, iva: 21, unidad: "UN" };

export type PosCartItem = Product & { cantidad: number; descuento?: number; precioBase?: number; pendienteOpId?: number; esManual?: boolean; cartUid?: string };

export type SaleMode = "NORMAL" | "PRESUPUESTO" | "RESERVA" | "PEDIDO" | "NOTA_CREDITO" | "NOTA_DEBITO";

export type SaleTab = { id: number; label: string; cart: PosCartItem[]; customer: TabCustomer; paymentCondition: string; notes: string; mode: SaleMode; sellerId?: number | null; branchId?: number | null; cashierId?: number | null; reserveFundId?: number | null; facturaAsociadaId?: number | null; clienteBloqueado?: boolean; origenDocumentoId?: number | null; pvSeleccionado?: number | null };

export type TabCustomer = { query: string; selected: Client | null };

export type Client = {
  id?: number;
  razonSocial: string;
  cuit?: string;
  dni?: string;
  condicionIVA?: string;
  domicilio?: string;
  telefono?: string;
  email?: string;
  descuento?: number;
};
