import { useState, useEffect } from "react";
import { erpApi } from "../services/api";

export function useServerRows(key:string,seed:any[]=[]){
 const normalize=(value:any[])=>key==='afip_checks_v30'?value.map((x:any)=>({...x,estado:String(x.estado||'EN_CARTERA').toUpperCase().replace(/\s+/g,'_')})):value;
 const [rows,setRows]=useState<any[]>(normalize(seed));
 useEffect(()=>{let active=true;erpApi.getState(key).then(r=>{if(!active)return;const value=Array.isArray(r.value)?r.value:seed;setRows(normalize(value));if(r.value==null&&seed.length)erpApi.saveState(key,normalize(seed)).catch(()=>{})}).catch(()=>{});return()=>{active=false}},[key]);
 function save(next:any[]){const normalized=normalize(next);setRows(normalized);erpApi.saveState(key,normalized).then((r:any)=>{if(r&&Array.isArray(r.value))setRows(normalize(r.value))}).catch((err:any)=>alert(err.message||'No se pudo guardar.'))}
 return [rows,save] as const
}

export function useServerValue<T>(key:string,seed:T){
 const [value,setValue]=useState<T>(seed);
 useEffect(()=>{let active=true;erpApi.getState(key).then(r=>{if(active&&r.value!=null)setValue(r.value as T);else if(active)erpApi.saveState(key,seed).catch(()=>{})}).catch(()=>{});return()=>{active=false}},[key]);
 function save(next:T){setValue(next);return erpApi.saveState(key,next)}
 return [value,setValue,save] as const;
}
