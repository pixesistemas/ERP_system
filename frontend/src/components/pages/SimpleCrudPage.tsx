import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useServerRows } from "../../hooks/useServerStorage";
import { api, erpApi } from "../../services/api";

export function SimpleCrudPage({kind}:{kind:'SUCURSALES'|'CAJEROS'}){
  const key=kind==='SUCURSALES'?'afip_branches_v32':'afip_cashiers_v32';
  const [rows,save]=useServerRows(key,[]);
  const [editing,setEditing]=useState<any>(null);
  const [users,setUsers]=useState<any[]>([]);
  const [puntos,setPuntos]=useState<any[]>([]);
  const [puntosSel,setPuntosSel]=useState<Set<number>>(new Set());
  useEffect(()=>{if(kind!=='CAJEROS')return;api.listUsers().then((r:any)=>setUsers(r.usuarios||[])).catch(()=>{})},[kind]);
  const esIdReal=(r:any)=>Number(r?.id)>0&&Number(r.id)<1e12;
  async function openEdit(r:any){
    setEditing({...r});
    if(kind==='SUCURSALES'&&esIdReal(r)){
      try{const p=await erpApi.listPointsOfSale();const lista=p.pointsOfSale||p.puntosVenta||[];setPuntos(lista);setPuntosSel(new Set(lista.filter((x:any)=>Number(x.sucursal_id)===Number(r.id)).map((x:any)=>Number(x.id))))}catch{}
    }
  }
  async function submit(e:any){
    e.preventDefault();
    const row={...editing,activo:editing.activo!==false};
    const editandoId=editing.id;
    save(editing.id?rows.map((x:any)=>x.id===editing.id?row:x):[{...row,id:Date.now()},...rows]);
    if(kind==='SUCURSALES'&&esIdReal(editing)){
      const objetivo=Number(editandoId);
      for(const pv of puntos){
        const id=Number(pv.id);
        const tenia=Number(pv.sucursal_id)===objetivo;
        const debe=puntosSel.has(id);
        if(tenia!==debe){try{await erpApi.updatePointOfSale(id,{...pv,sucursal_id:debe?objetivo:null})}catch{}}
      }
    }
    setEditing(null);
  }
  async function remove(r:any){
    if(!confirm(`¿Eliminar ${r.nombre}?`))return;
    if(kind==='CAJEROS'&&esIdReal(r)){try{await erpApi.deleteCajero(Number(r.id))}catch{}}
    save(rows.filter((x:any)=>x.id!==r.id));
  }
  function toggle(r:any){save(rows.map((x:any)=>x.id===r.id?{...x,activo:r.activo===false}:x))}
  return <div className="products-page"><div className="products-toolbar"><div><h3>{kind==='SUCURSALES'?'Sucursales':'Cajeros'}</h3><p>{kind==='SUCURSALES'?'Locales y depósitos operativos.':'Cajas operativas para ventas y reportes. Se pueden asignar a un usuario.'}</p></div><button className="primary-action" onClick={()=>{setEditing({nombre:'',codigo:'',domicilio:'',usuarioId:'',activo:true});setPuntos([]);setPuntosSel(new Set())}}><Plus/> Nuevo</button></div><div className="products-card"><table><thead><tr><th>Código</th><th>Nombre</th>{kind==='CAJEROS'?<th>Usuario</th>:<th>Domicilio</th>}<th>Estado</th><th></th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id}><td>{r.codigo}</td><td><strong>{r.nombre}</strong></td>{kind==='CAJEROS'?<td>{users.find((u:any)=>Number(u.id)===Number(r.usuarioId))?.nombre||'-'}</td>:<td>{r.domicilio}</td>}<td><button className="link-button" title="Cambiar estado" onClick={()=>toggle(r)}>{r.activo!==false?'ACTIVO':'INACTIVO'}</button></td><td><button title="Editar" onClick={()=>openEdit(r)}><Pencil size={16}/></button><button title="Eliminar" onClick={()=>remove(r)}><Trash2 size={16}/></button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty-table">No hay registros cargados.</div>}</div>{editing&&<div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={submit}><div className="modal-head"><h3>{kind==='SUCURSALES'?'Sucursal':'Caja / cajero'}</h3><button type="button" onClick={()=>setEditing(null)}><X/></button></div><div className="form-grid"><label>Código<input value={editing.codigo} onChange={e=>setEditing({...editing,codigo:e.target.value})}/></label><label>Nombre<input required value={editing.nombre} onChange={e=>setEditing({...editing,nombre:e.target.value})}/></label>{kind==='CAJEROS'?<label>Usuario<select value={editing.usuarioId||''} onChange={e=>setEditing({...editing,usuarioId:e.target.value})}><option value="">Sin usuario</option>{users.map((u:any)=><option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>:<label className="full">Domicilio<input value={editing.domicilio} onChange={e=>setEditing({...editing,domicilio:e.target.value})}/></label>}<label className="full checkbox-line"><input type="checkbox" checked={editing.activo!==false} onChange={e=>setEditing({...editing,activo:e.target.checked})}/> Activo</label>{kind==='SUCURSALES'&&esIdReal(editing)&&<div className="full pv-list"><strong>Puntos de venta de esta sucursal</strong>{puntos.map((pv:any)=><label key={pv.id} className="pv-row"><input type="checkbox" checked={puntosSel.has(Number(pv.id))} onChange={e=>{const next=new Set(puntosSel);if(e.target.checked)next.add(Number(pv.id));else next.delete(Number(pv.id));setPuntosSel(next)}}/><span><b>PV {pv.numero}</b> — {pv.nombre||'Sin nombre'}</span></label>)}{!puntos.length&&<div className="empty-table">No hay puntos de venta activos.</div>}</div>}{kind==='SUCURSALES'&&!esIdReal(editing)&&<p className="full form-hint">Guardá la sucursal y volvé a abrirla para asociarle puntos de venta.</p>}</div><div className="modal-actions"><button type="button" onClick={()=>setEditing(null)}>Cancelar</button><button className="save">Guardar</button></div></form></div>}</div>
}
