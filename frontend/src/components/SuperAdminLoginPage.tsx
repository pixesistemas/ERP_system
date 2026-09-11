import React, { useState } from "react";
import { Bot, ChevronLeft, ChevronRight, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api/v1";

export function SuperAdminLoginPage() {
  const DEMO = (import.meta as any).env?.VITE_DEMO_MODE === "true";
  const [usuario, setUsuario] = useState(DEMO ? "superadmin" : "");
  const [password, setPassword] = useState(DEMO ? "admin123" : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_URL}/superadmin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo iniciar sesión");
      sessionStorage.setItem("afip_superadmin_token", j.token);
      sessionStorage.setItem("afip_superadmin_nombre", j.superadmin?.nombre || usuario);
      window.location.hash = "#/superadmin";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page">
    <section className="login-hero">
      <div className="brand-pill"><ShieldCheck size={16}/> Panel de administración</div>
      <h1>PixeSistemas<br/><span>ERP Empresarial.</span></h1>
      <p>Gestioná las empresas, sus usuarios y las licencias de alquiler del sistema desde un único panel.</p>
      <div className="hero-cards">
        <div><KeyRound/><strong>Acceso separado</strong><span>Solo el programador ingresa acá.</span></div>
        <div><ShieldCheck/><strong>Multi-empresa</strong><span>Cada empresa con sus usuarios.</span></div>
        <div><Bot/><strong>Licencias</strong><span>Mensual, trimestral o definitiva.</span></div>
      </div>
    </section>
    <form className="login-card" onSubmit={submit}>
      <div className="logo"><ShieldCheck size={25}/></div>
      <h2>Administración PixeSistemas</h2><p>Ingresá con tu cuenta de programador.</p>
      <label>Usuario<input value={usuario} onChange={e=>setUsuario(e.target.value)} /></label>
      <label>Contraseña<input type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
      {error && <div className="error-box">{error}</div>}
      <button disabled={loading}>{loading ? <RefreshCw className="spin"/> : <><span>Ingresar al panel</span><ChevronRight size={18}/></>}</button>
      <a className="login-back" onClick={()=>{ window.location.hash = "#/recuperar-superadmin"; }}>¿Olvidaste tu contraseña?</a>
      <a className="login-back" onClick={()=>{ window.location.hash = "#/"; }}><ChevronLeft size={15}/> Volver al sistema</a>
      {DEMO && <small>Usuario: superadmin · Clave: admin123</small>}
    </form>
  </main>;
}