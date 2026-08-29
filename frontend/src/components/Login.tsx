import React, { useState } from "react";
import { Bot, ChevronRight, MessageSquareText, RefreshCw, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { api } from "../services/api";

export function Login({ onLogin }: { onLogin: (data: any) => void }) {
  const [email, setEmail] = useState("admin@empresa.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const result = await api.login(email, password);
      sessionStorage.setItem("afip_demo_token", result.token);
      sessionStorage.setItem("afip_demo_refresh", result.refreshToken || "");
      onLogin(result);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
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
      <a className="login-back" onClick={()=>{ window.location.hash = "#/superadmin-login"; }}><ShieldCheck size={15}/> Panel de administración</a>
      <small>Usuario: admin@empresa.com · Clave: admin123</small>
    </form>
  </main>
}
