import { useState, useEffect } from "react";
import { Plus, Trash2, X, Search } from "lucide-react";
import { api } from "../../services/api";
import { useServerRows } from "../../hooks/useServerStorage";
import { fmtFecha } from "../../utils/fecha";

export function StockTransfersPage(){
  const [branches]=useServerRows('afip_branches_v32',[{id:1,nombre:'Principal'},{id:2,nombre:'Depósito'}]);
  const [rows,save]=useServerRows('afip_stock_transfers_v35',[]);
  const [editing,setEditing]=useState<any>(null);
  const [products,setProducts]=useState<any[]>([]);
  const [stockMap,setStockMap]=useState<Record<number,Record<number,number>>>({});
  const [prodSearch,setProdSearch]=useState<string>("");

  useEffect(()=>{api.listProducts('').then(r=>setProducts(r.products||[])).catch(()=>{})},[]);
  useEffect(()=>{api.listStock().then(r=>{const map:Record<number,Record<number,number>>={};for(const s of (r.stock||[])){const pid=Number(s.producto_id);map[pid]=map[pid]||{};map[pid][Number(s.deposito_id)]=Number(s.disponible!=null?s.disponible:s.cantidad)||0;}setStockMap(map)}).catch(()=>{})},[]);

  function depositoDe(branchId:any){const b=branches.find((x:any)=>String(x.id)===String(branchId));return b?.depositoId!=null?Number(b.depositoId):null;}
  function stockDisponible(productId:any,branchId:any){const dep=depositoDe(branchId);if(!productId||dep==null)return null;return stockMap[Number(productId)]?.[dep]??0;}
  function itemsConStock(){
    if(!editing)return[];
    return (editing.items||[]).map((it:any)=>{
      const disp=stockDisponible(it.productId,editing.origenId);
      const cantidad=Number(it.cantidad)||0;
      return {it,disp,cantidad,sinStock:disp!=null&&cantidad>disp};
    });
  }

  function submit(e:any){
    e.preventDefault();
    if(editing.origenId===editing.destinoId)return alert('Origen y destino deben ser diferentes.');
    if(!(editing.items||[]).length)return alert('Agregá al menos un producto.');
    const mal=itemsConStock().filter((x:any)=>x.sinStock);
    if(mal.length)return alert('Hay productos con stock insuficiente en el origen. Revisá los marcados en rojo.');
    save([{...editing,id:Date.now(),fecha:new Date().toISOString(),estado:'CONFIRMADA'},...rows]);
    setEditing(null);
  }
  function addItem(){setEditing({...editing,items:[...(editing.items||[]),{id:Date.now(),productId:'',q:'',cantidad:1}]})}
  function elegirProducto(i:number,x:any){setEditing({...editing,items:editing.items.map((r:any,j:number)=>j===i?{...r,productId:x.id,q:`${x.codigo} · ${x.descripcion}`}:r)});setProdSearch("");}

  const sugerencias=(editing?.items||[]).length?products.filter((p:any)=>`${p.codigo} ${p.descripcion}`.toLowerCase().includes(prodSearch.toLowerCase())).slice(0,8):[];
  const itemsInfo=itemsConStock();

  return <div className="products-page"><div className="products-toolbar"><div><h3>Transferencias entre sucursales</h3><p>Una transferencia puede contener varios productos. Se valida el stock disponible en el origen.</p></div><button className="primary-action" onClick={()=>setEditing({origenId:'',destinoId:'',items:[],motivo:'Transferencia interna'})}><Plus/> Nueva transferencia</button></div><div className="products-card"><table><thead><tr><th>Fecha</th><th>Origen</th><th>Destino</th><th>Productos</th><th>Estado</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td>{fmtFecha(r.fecha)}</td><td>{branches.find((b:any)=>String(b.id)===String(r.origenId))?.nombre}</td><td>{branches.find((b:any)=>String(b.id)===String(r.destinoId))?.nombre}</td><td>{(r.items||[]).length}</td><td>{r.estado}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty-table">No hay transferencias todavía.</div>}</div>
  {editing&&<div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={submit}><div className="modal-head"><h3>Transferir stock</h3><button type="button" onClick={()=>setEditing(null)}><X/></button></div><div className="form-grid"><label>Origen<select required value={editing.origenId} onChange={e=>setEditing({...editing,origenId:e.target.value})}><option value="">Seleccionar...</option>{branches.map((b:any)=><option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label><label>Destino<select required value={editing.destinoId} onChange={e=>setEditing({...editing,destinoId:e.target.value})}><option value="">Seleccionar...</option>{branches.map((b:any)=><option key={b.id} value={b.id}>{b.nombre}</option>)}</select></label><label className="full">Motivo<input value={editing.motivo} onChange={e=>setEditing({...editing,motivo:e.target.value})}/></label><div className="full transfer-items"><div className="supplier-links-head"><strong>Productos</strong><button type="button" onClick={addItem}><Plus size={16}/> Agregar producto</button></div>{(editing.items||[]).map((r:any,i:number)=>{const info=itemsInfo[i];const disp=info&&info.disp!=null?info.disp:null;return <div className="transfer-item" key={r.id}>
    <div className="tf-top">
      <div className="tf-buscar">
        <input required value={r.q} list="tf-productos" placeholder="Escribí código o nombre y elegí de la lista..." onChange={e=>{const q=e.target.value;const p=products.find((x:any)=>String(x.codigo)===String(q).trim());setEditing({...editing,items:editing.items.map((x:any,j:number)=>j===i?{...x,q,productId:p?p.id:''}:x)})}}/>
        <datalist id="tf-productos">{products.slice(0,3000).map((p:any)=><option key={p.id} value={p.codigo}>{p.descripcion}</option>)}</datalist>
      </div>
      <input type="number" min="0.001" step="0.001" value={r.cantidad} placeholder="Cantidad" onChange={e=>setEditing({...editing,items:editing.items.map((x:any,j:number)=>j===i?{...x,cantidad:Number(e.target.value)}:x)})}/>
      <button type="button" onClick={()=>setEditing({...editing,items:editing.items.filter((_:any,j:number)=>j!==i)})}><Trash2 size={16}/></button>
    </div>
    {info&&info.sinStock?<span className="tf-sin-stock">Sin stock en el origen (disponible {info.disp})</span>:info&&info.disp!=null?<small className="tf-disponible">Disponible en el origen: {info.disp}</small>:<small className="tf-hint">Seleccioná un producto y un origen para ver el stock</small>}
  </div>})}</div></div><div className="modal-actions"><button type="button" onClick={()=>setEditing(null)}>Cancelar</button><button className="save">Confirmar transferencia</button></div></form></div>}</div>
}