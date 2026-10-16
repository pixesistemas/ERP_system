import { useState, useEffect } from "react";
import { erpApi } from "../services/api";
import { guardarCacheEstado, leerCacheEstado } from "../offline/posDb";

/*
 * Valores por empresa guardados en el servidor (/erp/state/:key).
 * Además del servidor, se cachean en IndexedDB: si se corta el internet,
 * las pantallas siguen viendo el último valor bueno (por ejemplo las
 * promociones y descuentos del POS) en lugar de quedar vacías.
 */

export function useServerRows(key:string,seed:any[]=[]){
 const normalize=(value:any[])=>key==='afip_checks_v30'?value.map((x:any)=>({...x,estado:String(x.estado||'EN_CARTERA').toUpperCase().replace(/\s+/g,'_')})):value;
 const [rows,setRows]=useState<any[]>(normalize(seed));
 useEffect(()=>{let active=true;erpApi.getState(key).then(r=>{if(!active)return;const value=Array.isArray(r.value)?r.value:seed;setRows(normalize(value));guardarCacheEstado(key,value).catch(()=>{});if(r.value==null&&seed.length)erpApi.saveState(key,normalize(seed)).catch(()=>{})}).catch(async()=>{const cache=await leerCacheEstado<any[]>(key).catch(()=>null);if(active&&Array.isArray(cache))setRows(normalize(cache))});return()=>{active=false}},[key]);
 function save(next:any[]){const normalized=normalize(next);setRows(normalized);guardarCacheEstado(key,normalized).catch(()=>{});erpApi.saveState(key,normalized).then((r:any)=>{if(r&&Array.isArray(r.value))setRows(normalize(r.value))}).catch((err:any)=>alert(err.message||'No se pudo guardar.'))}
 return [rows,save] as const
}

export function useServerValue<T>(key:string,seed:T){
 const [value,setValue]=useState<T>(seed);
 useEffect(()=>{let active=true;erpApi.getState(key).then(r=>{if(active&&r.value!=null){setValue(r.value as T);guardarCacheEstado(key,r.value).catch(()=>{})}else if(active)erpApi.saveState(key,seed).catch(()=>{})}).catch(async()=>{const cache=await leerCacheEstado<T>(key).catch(()=>null);if(active&&cache!=null)setValue(cache)});return()=>{active=false}},[key]);
 function save(next:T){setValue(next);guardarCacheEstado(key,next).catch(()=>{});return erpApi.saveState(key,next)}
 return [value,setValue,save] as const;
}
