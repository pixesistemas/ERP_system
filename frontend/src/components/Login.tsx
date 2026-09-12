import React, { useState } from "react";
import { Bot, ChevronRight, MessageSquareText, RefreshCw, ShieldCheck, Sparkles, Zap, Building2, ChevronLeft } from "lucide-react";
import { api } from "../services/api";

export function Login({ onLogin }: { onLogin: (data: any) => void }) {
  const DEMO = (import.meta as any).env?.VITE_DEMO_MODE === "true";
  const [email, setEmail] = useState(DEMO ? "admin@empresa.com" : "");
  const [password, setPassword] = useState(DEMO ? "admin123" : "");
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function entrar(result: any) {
    sessionStorage.setItem("afip_demo_token", result.token);
    sessionStorage.setItem("afip_demo_refresh", result.refreshToken || "");
    onLogin(result);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const result = await api.login(email, password);
      if (result.requiereEmpresa) {
        setEmpresas(result.empresas || []);
        return;
      }
      entrar(result);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  async function elegirEmpresa(empresa: any) {
    setLoading(true); setError("");
    try {
      const result = await api.login(email, password, Number(empresa.id));
      entrar(result);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  if (empresas.length) {
    return <main className="login-page">
      <section className="login-hero">
        <div className="brand-pill"><Sparkles size={16}/> ERP Empresarial</div>
        <h1>Elegí la empresa<br/><span>con la que vas a trabajar.</span></h1>
        <p>Tu usuario tiene más de una empresa asignada. Seleccioná con cuál querés iniciar sesión.</p>
      </section>
      <div className="login-card">
        <div className="logo"><Building2 size={25}/></div>
        <h2>Seleccionar empresa</h2><p>Ingresás como {email}.</p>
        <div className="company-picker">
          {empresas.map((e) => <button key={e.id} type="button" disabled={loading} onClick={() => elegirEmpresa(e)}>
            <span><strong>{e.nombre}</strong></span><ChevronRight size={18}/>
          </button>)}
        </div>
        {error && <div className="error-box">{error}</div>}
        <a className="login-back" onClick={() => { setEmpresas([]); setError(""); }}><ChevronLeft size={15}/> Volver</a>
      </div>
    </main>;
  }

  return <main className="login-page">
    <section className="login-hero">
      <div className="brand-pill"><Sparkles size={16}/> ERP Empresarial</div>
      <h1>Facturación y gestión<br/><span>mediante conversación.</span></h1>
      <p>Una experiencia simple para preparar presupuestos, pedidos, remitos y facturas usando lenguaje natural.</p>
      <div className="hero-cards">
        <div><MessageSquareText/><strong>Conversacional</strong><span>Entiende pedidos comerciales.</span></div>
        <div><ShieldCheck/><strong>Controlado</strong><span>Valida antes de confirmar.</span></div>
        <div><Zap/><strong>Rápido</strong><span>Reduce pasos repetitivos.</span></div>
      </div>
    </section>
    <form className="login-card" onSubmit={submit}>
      <div className="logo"><Bot size={25}/></div>
      <h2>Asistente Comercial</h2><p>Ingresá con tu cuenta del sistema.</p>
      <label>Correo<input value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
      {error && <div className="error-box">{error}</div>}
      <button disabled={loading}>{loading ? <RefreshCw className="spin"/> : <><span>Ingresar</span><ChevronRight size={18}/></>}</button>
      <a className="login-back" onClick={()=>{ window.location.hash = "#/recuperar"; }}>¿Olvidaste tu contraseña?</a>
      {DEMO && <a className="login-back" onClick={()=>{ window.location.hash = "#/superadmin-login"; }}><ShieldCheck size={15}/> Panel de administración</a>}
      {DEMO && <small>Usuario: admin@empresa.com · Clave: admin123</small>}
    </form>
  </main>
}