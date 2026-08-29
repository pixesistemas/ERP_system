import React, { useEffect, useState } from "react";
import { Building2, FileKey2, KeyRound, LogOut, Pencil, Plus, ShieldCheck, Sparkles, Trash2, TrendingUp, Users, X, Palette } from "lucide-react";

const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api/v1";

function useSuperAdminApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  function token() {
    return sessionStorage.getItem("afip_superadmin_token") || "";
  }

  async function call<T>(method: string, path: string, body?: any): Promise<T> {
    setError("");
    const r = await fetch(`${API_URL}/superadmin${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Error del servidor");
    return j as T;
  }

  return { loading, setLoading, error, setError, ok, setOk, call };
}

const fmt = (n: any) => Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtFecha = (s: any) => (s ? String(s).slice(0, 10) : "—");

const TEMAS: Record<string, { label: string; swatches: string[] }> = {
  lavanda: { label: "Lavanda", swatches: ["#8B7FD4", "#E6E1F2", "#3B3555"] },
  rosa: { label: "Rosa", swatches: ["#E79BB4", "#F5DEE6", "#5C3A47"] },
  menta: { label: "Menta", swatches: ["#8FC7B5", "#DCEFEA", "#31584C"] },
  celeste: { label: "Celeste", swatches: ["#93BFE0", "#DCEAF5", "#34546E"] },
  durazno: { label: "Durazno", swatches: ["#F2B18C", "#FBE6D8", "#6E4529"] },
  arena: { label: "Arena", swatches: ["#D9B98A", "#F2E9D8", "#5F4A26"] },
};

export function SuperAdminPage() {
  const [tab, setTab] = useState<"EMPRESAS" | "USUARIOS" | "LICENCIAS" | "TEMAS" | "FISCALES" | "CHANGELOG" | "ALTA">("EMPRESAS");
  const { loading, setLoading, error, setError, ok, setOk, call } = useSuperAdminApi();
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [licencias, setLicencias] = useState<any[]>([]);
  const [empresaModal, setEmpresaModal] = useState<any>(null);
  const [usuarioModal, setUsuarioModal] = useState<any>(null);
  const [licenciaModal, setLicenciaModal] = useState<any>(null);
  const [claveModal, setClaveModal] = useState<any>(null);
  const [fiscalModal, setFiscalModal] = useState<any>(null);
  const [changelog, setChangelog] = useState<any[]>([]);
  const [changelogModal, setChangelogModal] = useState<any>(null);
  const [versionActual, setVersionActual] = useState("");
  const [alta, setAlta] = useState<any>({ nombre: "", cuit: "", condicionIva: "RESPONSABLE INSCRIPTO", adminNombre: "", adminEmail: "", adminPassword: "", plan: "TRIMESTRAL", precio: "", descuento: "", csvClientes: null, csvProductos: null });
  const [filtroEmpresa, setFiltroEmpresa] = useState("");

  const nombreSa = sessionStorage.getItem("afip_superadmin_nombre") || "Administrador";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [e, u, l] = await Promise.all([
        call<any>("GET", "/empresas"),
        call<any>("GET", "/usuarios"),
        call<any>("GET", "/licencias"),
      ]);
      setEmpresas(e.empresas || []);
      setUsuarios(u.usuarios || []);
      setLicencias(l.licencias || []);
      try { const c = await call<any>("GET", "/changelog"); setChangelog(c.entradas || []); } catch (err: any) { setChangelog([]); }
      try { const v = await call<any>("GET", "/version"); setVersionActual(v.version || ""); } catch (err: any) {}
    } catch (err: any) {
      setError(err.message);
      if (String(err.message).includes("Token")) salir();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function salir() {
    sessionStorage.removeItem("afip_superadmin_token");
    sessionStorage.removeItem("afip_superadmin_nombre");
    window.location.hash = "#/";
  }

  async function guardarEmpresa(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body: any = {
        nombre: empresaModal.nombre,
        cuit: empresaModal.cuit || "",
        condicionIva: empresaModal.condicionIva,
        razonSocial: empresaModal.razonSocial || empresaModal.nombre,
        direccion: empresaModal.direccion || "",
        localidad: empresaModal.localidad || "",
        provincia: empresaModal.provincia || "",
        telefono: empresaModal.telefono || "",
        email: empresaModal.email || "",
        activa: empresaModal.activa !== false,
        versionInstalada: empresaModal.versionInstalada || "",
      };
      if (empresaModal.id) {
        await call("PATCH", `/empresas/${empresaModal.id}`, body);
        setOk("Empresa actualizada.");
      } else {
        await call("POST", "/empresas", body);
        setOk("Empresa creada.");
      }
      setEmpresaModal(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function guardarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (usuarioModal.id) {
        await call("PATCH", `/usuarios/${usuarioModal.id}`, { activo: usuarioModal.activo !== false });
        setOk("Usuario actualizado.");
      } else {
        await call("POST", "/usuarios", {
          nombre: usuarioModal.nombre,
          email: usuarioModal.email,
          password: usuarioModal.password,
          empresaId: Number(usuarioModal.empresaId),
          rol: Number(usuarioModal.rol),
        });
        setOk("Usuario creado.");
      }
      setUsuarioModal(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function guardarLicencia(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await call("POST", "/licencias", {
        empresaId: Number(licenciaModal.empresaId),
        plan: licenciaModal.plan,
        precio: Number(licenciaModal.precio) || 0,
        descuentoPorc: Number(licenciaModal.descuento) || 0,
        fechaInicio: licenciaModal.fechaInicio || new Date().toISOString().slice(0, 10),
        notas: licenciaModal.notas || "",
      });
      setOk("Licencia registrada.");
      setLicenciaModal(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resetClave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await call("PATCH", `/usuarios/${claveModal.id}`, { password: claveModal.password });
      setOk(`Clave de ${claveModal.nombre} actualizada.`);
      setClaveModal(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function cambiarEstadoLicencia(id: number, estado: string) {
    setLoading(true);
    try {
      await call("PATCH", `/licencias/${id}/estado`, { estado });
      setOk("Estado de la licencia actualizado.");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function abrirFiscales(e: any) {
    setLoading(true);
    setError("");
    try {
      const r = await call<any>("GET", `/empresas/${e.id}/datos-fiscales`);
      setFiscalModal({
        empresaId: e.id,
        nombre: e.nombre,
        data: { ...r.data },
        archivos: r.archivos || [],
        conectado: r.conectado || { certificado: false, llave: false },
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function guardarFiscales() {
    if (!fiscalModal) return;
    setLoading(true);
    try {
      await call("PUT", `/empresas/${fiscalModal.empresaId}/datos-fiscales`, { data: fiscalModal.data });
      setOk(`Datos fiscales de ${fiscalModal.nombre} actualizados.`);
      setFiscalModal(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function subirArchivoFiscal(tipo: string, file: File) {
    if (!fiscalModal) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API_URL}/superadmin/empresas/${fiscalModal.empresaId}/archivos-fiscales/${tipo}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionStorage.getItem("afip_superadmin_token") || ""}` },
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo subir el archivo.");
      setOk("Archivo fiscal subido.");
      const g = await call<any>("GET", `/empresas/${fiscalModal.empresaId}/datos-fiscales`);
      setFiscalModal({ ...fiscalModal, archivos: g.archivos || [], conectado: g.conectado || { certificado: false, llave: false } });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function guardarChangelog(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (changelogModal.id) {
        await call("PATCH", `/changelog/${changelogModal.id}`, changelogModal);
        setOk("Entrada actualizada.");
      } else {
        await call("POST", "/changelog", changelogModal);
        setOk("Entrada creada.");
      }
      setChangelogModal(null);
      const c = await call<any>("GET", "/changelog");
      setChangelog(c.entradas || []);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function eliminarChangelog(id: number) {
    if (!confirm("¿Eliminar esta entrada del historial?")) return;
    setLoading(true);
    try {
      await call("DELETE", `/changelog/${id}`);
      setChangelog((prev) => prev.filter((x) => x.id !== id));
      setOk("Entrada eliminada.");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function subirVersion() {
    setLoading(true);
    try {
      const r = await call<any>("POST", "/version/subir");
      setVersionActual(r.version);
      setOk(`Versión subida a ${r.version}.`);
      setChangelogModal({ version: r.version, fecha: new Date().toISOString().slice(0, 10), tipo: "NUEVO", titulo: "", detalle: "" });
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function crearClienteNuevo(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    try {
      if (!String(alta.nombre || "").trim()) throw new Error("El nombre de la empresa es obligatorio.");
      if (!String(alta.adminEmail || "").trim() || !String(alta.adminPassword || "").trim()) throw new Error("Email y clave del usuario administrador son obligatorios.");
      const emp = await call<any>("POST", "/empresas", { nombre: alta.nombre, cuit: alta.cuit || "", condicionIva: alta.condicionIva });
      const empId = emp.empresa.id;
      await call("POST", "/usuarios", { nombre: alta.adminNombre || "Administrador", email: alta.adminEmail, password: alta.adminPassword, empresaId: empId, rol: 1 });
      await call("POST", "/licencias", { empresaId: empId, plan: alta.plan, precio: Number(alta.precio) || 0, descuentoPorc: Number(alta.descuento) || 0, fechaInicio: new Date().toISOString().slice(0, 10) });
      let clientes = 0, productos = 0;
      const token = sessionStorage.getItem("afip_superadmin_token") || "";
      if (alta.csvClientes) {
        const fd = new FormData(); fd.append("file", alta.csvClientes);
        const r1 = await fetch(`${API_URL}/superadmin/empresas/${empId}/importar-clientes`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const j1 = await r1.json().catch(() => ({}));
        clientes = j1.importados || 0;
        if (!r1.ok) setError(j1.error || "No se pudieron importar los clientes.");
        else if (j1.errores && j1.errores.length) setError(j1.errores.slice(0, 5).join(" | "));
      }
      if (alta.csvProductos) {
        const fd = new FormData(); fd.append("file", alta.csvProductos);
        const r2 = await fetch(`${API_URL}/superadmin/empresas/${empId}/importar-productos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
        const j2 = await r2.json().catch(() => ({}));
        productos = j2.importados || 0;
        if (!r2.ok) setError(j2.error || "No se pudieron importar los productos.");
      }
      setOk(`Cliente creado: ${alta.nombre} (id ${empId}). Usuario administrador y licencia ${alta.plan} cargados. Importados: ${clientes} clientes y ${productos} productos.`);
      setAlta({ nombre: "", cuit: "", condicionIva: "RESPONSABLE INSCRIPTO", adminNombre: "", adminEmail: "", adminPassword: "", plan: "TRIMESTRAL", precio: "", descuento: "", csvClientes: null, csvProductos: null });
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  const empresasVisibles = empresas;
  const usuariosVisibles = filtroEmpresa ? usuarios.filter((u) => String(u.empresas || "").includes(empresas.find((e: any) => e.id === Number(filtroEmpresa))?.nombre || "___")) : usuarios;

  return <div className="sa-shell">
    <header className="sa-header">
      <div className="sa-brand"><ShieldCheck size={20}/> <strong>PixeSistemas</strong> <span>Panel de administración</span></div>
      <div className="sa-user"><KeyRound size={15}/> {nombreSa} <button className="sa-salir" onClick={salir}><LogOut size={15}/> Salir</button></div>
    </header>
    <nav className="sa-tabs">
      <button className={tab === "EMPRESAS" ? "active" : ""} onClick={() => setTab("EMPRESAS")}><Building2 size={16}/> Empresas</button>
      <button className={tab === "USUARIOS" ? "active" : ""} onClick={() => setTab("USUARIOS")}><Users size={16}/> Usuarios</button>
      <button className={tab === "LICENCIAS" ? "active" : ""} onClick={() => setTab("LICENCIAS")}><KeyRound size={16}/> Licencias</button>
      <button className={tab === "TEMAS" ? "active" : ""} onClick={() => setTab("TEMAS")}><Palette size={16}/> Temas</button>
      <button className={tab === "FISCALES" ? "active" : ""} onClick={() => setTab("FISCALES")}><FileKey2 size={16}/> Fiscales</button>
      <button className={tab === "CHANGELOG" ? "active" : ""} onClick={() => setTab("CHANGELOG")}><Sparkles size={16}/> Novedades</button>
      <button className={tab === "ALTA" ? "active" : ""} onClick={() => setTab("ALTA")}><Plus size={16}/> Alta cliente</button>
    </nav>
    <main className="sa-main">
      {error && <div className="error-box">{error}</div>}
      {ok && <div className="success-box">{ok}</div>}

      {tab === "EMPRESAS" && <div className="products-page">
        <div className="products-toolbar">
          <div><h3>Empresas</h3><p>Creá y administrá las empresas que usan el ERP.</p></div>
          <button className="primary-action" onClick={() => setEmpresaModal({ nombre: "", cuit: "", condicionIva: "MONOTRIBUTO", direccion: "", localidad: "", provincia: "", telefono: "", email: "", activa: true, versionInstalada: "" })}><Plus/> Nueva empresa</button>
        </div>
        <div className="products-card"><table>
          <thead><tr><th>ID</th><th>Empresa</th><th>CUIT</th><th>Condición IVA</th><th>Versión</th><th>PV</th><th>Plan activo</th><th>Vence licencia</th><th>Estado</th><th></th></tr></thead>
          <tbody>{empresasVisibles.map((e) => <tr key={e.id}>
            <td>{e.id}</td>
            <td><strong>{e.nombre}</strong><small>{e.razon_social}</small></td>
            <td>{e.cuit}</td>
            <td>{e.condicion_iva}</td>
            <td><code className="sa-version">{e.version_instalada || "—"}</code></td>
            <td>{e.punto_venta}</td>
            <td>{e.plan_activo || "Sin licencia"}</td>
            <td>{fmtFecha(e.vencimiento_licencia)}</td>
            <td>{e.activa ? <span className="sa-badge ok">Activa</span> : <span className="sa-badge off">Inactiva</span>}</td>
            <td><button className="sa-icon-btn" title="Editar" onClick={() => setEmpresaModal({ id: e.id, nombre: e.nombre, cuit: e.cuit, condicionIva: e.condicion_iva, razonSocial: e.razon_social, direccion: e.direccion || "", localidad: e.localidad || "", provincia: e.provincia || "", telefono: e.telefono || "", email: e.email || "", activa: !!e.activa, versionInstalada: e.version_instalada || "" })}><Pencil size={15}/></button></td>
          </tr>)}</tbody></table>
          {!empresasVisibles.length && <div className="empty-table">No hay empresas.</div>}
        </div>
      </div>}

      {tab === "USUARIOS" && <div className="products-page">
        <div className="products-toolbar">
          <div><h3>Usuarios</h3><p>Creá usuarios y vincúlalos a una empresa con rol ADMIN o VENDEDOR.</p></div>
          <div className="sa-toolbar-right">
            <label className="sa-filtro">Empresa<select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)}><option value="">Todas</option>{empresas.map((en) => <option key={en.id} value={en.id}>{en.nombre}</option>)}</select></label>
            <button className="primary-action" onClick={() => setUsuarioModal({ nombre: "", email: "", password: "", empresaId: empresas[0]?.id || "", rol: "3" })}><Plus/> Nuevo usuario</button>
          </div>
        </div>
        <div className="products-card"><table>
          <thead><tr><th>ID</th><th>Nombre</th><th>Email</th><th>Empresas</th><th>Estado</th><th></th></tr></thead>
          <tbody>{usuariosVisibles.map((u) => <tr key={u.id}>
            <td>{u.id}</td>
            <td><strong>{u.nombre}</strong></td>
            <td>{u.email}</td>
            <td>{u.empresas || "—"}</td>
            <td>{u.activo ? <span className="sa-badge ok">Activo</span> : <span className="sa-badge off">Inactivo</span>}</td>
            <td><div className="sa-row-actions">
              <button className="sa-icon-btn" title="Cambiar clave" onClick={() => setClaveModal({ id: u.id, nombre: u.nombre, password: "" })}><KeyRound size={15}/></button>
              <button className="sa-icon-btn" title={u.activo ? "Desactivar" : "Activar"} onClick={async () => { try { await call("PATCH", `/usuarios/${u.id}`, { activo: !u.activo }); setOk(u.activo ? "Usuario desactivado." : "Usuario activado."); await load(); } catch (err: any) { setError(err.message); } }}><Trash2 size={15}/></button>
            </div></td>
          </tr>)}</tbody></table>
          {!usuariosVisibles.length && <div className="empty-table">No hay usuarios.</div>}
        </div>
      </div>}

      {tab === "LICENCIAS" && <div className="products-page">
        <div className="products-toolbar">
          <div><h3>Licencias</h3><p>Vendé o alquilá el ERP por empresa: mensual, trimestral o definitivo.</p></div>
          <button className="primary-action" onClick={() => setLicenciaModal({ empresaId: empresas[0]?.id || "", plan: "MENSUAL", precio: "", descuento: "", fechaInicio: new Date().toISOString().slice(0, 10), notas: "" })}><Plus/> Nueva licencia</button>
        </div>
        <div className="products-card"><table>
          <thead><tr><th>ID</th><th>Empresa</th><th>Plan</th><th>Precio</th><th>Desc. %</th><th>Total</th><th>Inicio</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
          <tbody>{licencias.map((l) => <tr key={l.id}>
            <td>{l.id}</td>
            <td><strong>{l.empresa_nombre}</strong></td>
            <td>{l.plan}</td>
            <td>$ {fmt(l.precio)}</td>
            <td>{Number(l.descuento_porc || 0)}%</td>
            <td><b>$ {fmt(l.total)}</b></td>
            <td>{fmtFecha(l.fecha_inicio)}</td>
            <td>{l.plan === "DEFINITIVO" ? "Definitivo" : fmtFecha(l.fecha_vencimiento)}</td>
            <td>{l.estado === "ACTIVA" ? <span className="sa-badge ok">ACTIVA</span> : l.estado === "VENCIDA" ? <span className="sa-badge off">VENCIDA</span> : <span className="sa-badge off">CANCELADA</span>}</td>
            <td><div className="sa-row-actions">
              {l.estado !== "ACTIVA" && <button className="sa-icon-btn" title="Activar" onClick={() => cambiarEstadoLicencia(l.id, "ACTIVA")}>Activar</button>}
              {l.estado === "ACTIVA" && <button className="sa-icon-btn" title="Vencida" onClick={() => cambiarEstadoLicencia(l.id, "VENCIDA")}>Vencer</button>}
              {l.estado !== "CANCELADA" && <button className="sa-icon-btn" title="Cancelar" onClick={() => cambiarEstadoLicencia(l.id, "CANCELADA")}><Trash2 size={15}/></button>}
            </div></td>
          </tr>)}</tbody></table>
          {!licencias.length && <div className="empty-table">No hay licencias.</div>}
        </div>
      </div>}
    {tab === "TEMAS" && <div className="products-page">
        <div className="products-toolbar">
          <div><h3>Temas por empresa</h3><p>Elegí el color pastel que verá cada cliente al entrar al ERP. Se aplica al iniciar sesión.</p></div>
        </div>
        <div className="products-card"><table>
          <thead><tr><th>ID</th><th>Empresa</th><th>Tema</th><th>Vista previa</th><th>Guardar</th></tr></thead>
          <tbody>{empresas.map((e) => <tr key={e.id}>
            <td>{e.id}</td>
            <td><strong>{e.nombre}</strong><small>{e.razon_social}</small></td>
            <td><select className="sa-theme-select" value={e.tema || "lavanda"} onChange={(ev) => {
              const tema = ev.target.value;
              e.tema = tema;
              setEmpresas([...empresas]);
            }}>
              {Object.entries(TEMAS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select></td>
            <td><span className="sa-swatches">{(TEMAS[e.tema || "lavanda"]?.swatches || []).map((s, i) => <i key={i} style={{ background: s }} title={s}/>)}</span></td>
            <td><button className="sa-icon-btn" title="Guardar tema" onClick={async () => {
              setLoading(true);
              try {
                await call("PUT", `/empresas/${e.id}/tema`, { tema: e.tema || "lavanda" });
                setOk(`Tema de ${e.nombre} actualizado.`);
                await load();
              } catch (err: any) { setError(err.message); } finally { setLoading(false); }
            }}><Pencil size={15}/></button></td>
          </tr>)}</tbody></table>
          {!empresas.length && <div className="empty-table">No hay empresas.</div>}
        </div>
      </div>}
    {tab === "FISCALES" && <div className="products-page">
        <div className="products-toolbar">
          <div><h3>Datos fiscales y ARCA por empresa</h3><p>Razón social, CUIT, ambiente ARCA y certificados. La empresa solo puede verlos, no modificarlos.</p></div>
        </div>
        <div className="products-card"><table>
          <thead><tr><th>ID</th><th>Empresa</th><th>CUIT</th><th>Condición IVA</th><th></th></tr></thead>
          <tbody>{empresas.map((e) => <tr key={e.id}>
            <td>{e.id}</td>
            <td><strong>{e.nombre}</strong><small>{e.razon_social}</small></td>
            <td>{e.cuit || "—"}</td>
            <td>{e.condicion_iva || "—"}</td>
            <td><button className="sa-icon-btn" title="Editar datos fiscales" onClick={() => abrirFiscales(e)}><Pencil size={15}/> Editar</button></td>
          </tr>)}</tbody></table>
          {!empresas.length && <div className="empty-table">No hay empresas.</div>}
        </div>
      </div>}
    {tab === "ALTA" && <div className="products-page">
      <div className="products-toolbar"><div><h3>Alta de cliente nuevo desde cero</h3><p>Crea la empresa, el usuario administrador y la licencia, e importá clientes y productos desde CSV (de otro sistema).</p></div></div>
      <form className="settings-card" onSubmit={crearClienteNuevo}>
        <h4>Empresa</h4>
        <div className="form-grid">
          <label className="full">Nombre de la empresa<input required value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} placeholder="Ej: Ferretería San Martín S.R.L." /></label>
          <label>CUIT<input value={alta.cuit} onChange={(e) => setAlta({ ...alta, cuit: e.target.value })} placeholder="30-12345678-9" /></label>
          <label>Condición IVA<select value={alta.condicionIva} onChange={(e) => setAlta({ ...alta, condicionIva: e.target.value })}><option value="RESPONSABLE INSCRIPTO">Responsable Inscripto</option><option value="MONOTRIBUTO">Monotributo</option><option value="EXENTO">Exento</option><option value="CONSUMIDOR FINAL">Consumidor Final</option></select></label>
        </div>
        <h4>Usuario administrador</h4>
        <div className="form-grid">
          <label>Nombre<input value={alta.adminNombre} onChange={(e) => setAlta({ ...alta, adminNombre: e.target.value })} placeholder="Ej: Juan Pérez" /></label>
          <label>Email (para entrar al ERP)<input required type="email" value={alta.adminEmail} onChange={(e) => setAlta({ ...alta, adminEmail: e.target.value })} placeholder="admin@ferreteria.com" /></label>
          <label>Clave<input required type="password" value={alta.adminPassword} onChange={(e) => setAlta({ ...alta, adminPassword: e.target.value })} placeholder="••••••" /></label>
        </div>
        <h4>Licencia</h4>
        <div className="form-grid">
          <label>Plan<select value={alta.plan} onChange={(e) => setAlta({ ...alta, plan: e.target.value })}><option value="MENSUAL">Mensual</option><option value="TRIMESTRAL">Trimestral</option><option value="DEFINITIVO">Definitivo</option></select></label>
          <label>Precio (sin IVA)<input type="number" min="0" value={alta.precio} onChange={(e) => setAlta({ ...alta, precio: e.target.value })} placeholder="90000" /></label>
          <label>Descuento %<input type="number" min="0" max="100" value={alta.descuento} onChange={(e) => setAlta({ ...alta, descuento: e.target.value })} placeholder="10" /></label>
        </div>
        <h4>Importar datos de otro sistema (CSV)</h4>
        <div className="info-note">Clientes: columnas <b>nombre</b> (obligatoria), cuit, dni, condicionIva, domicilio, localidad, provincia, email, telefono, descuento. Productos: columnas <b>codigo</b> y <b>descripcion</b> (obligatorias), precio, iva, costo, unidad, codigoBarra, rubro. Acepta comas o punto y coma.</div>
        <div className="form-grid">
          <label>Clientes CSV<input type="file" accept=".csv,.txt" onChange={(e) => setAlta({ ...alta, csvClientes: e.target.files?.[0] || null })} /></label>
          <label>Productos CSV<input type="file" accept=".csv,.txt" onChange={(e) => setAlta({ ...alta, csvProductos: e.target.files?.[0] || null })} /></label>
        </div>
        <div className="modal-actions"><button className="primary-action" disabled={loading}><Plus size={15}/> Crear cliente e importar</button></div>
      </form>
    </div>}
    {tab === "CHANGELOG" && <div className="products-page">
        <div className="products-toolbar">
          <div><h3>Historial de cambios (novedades)</h3><p>Lo que ven los clientes en Novedades. Registrá acá cada corrección o función nueva para poder notificarlos.</p><small className="sa-version-actual">Versión actual del sistema: <code>{versionActual || "—"}</code></small></div>
          <div className="sa-row-actions">
            <button className="secondary-action" onClick={subirVersion} title="Sube la versión del sistema y prepara una entrada nueva"><TrendingUp size={16}/> Subir versión</button>
            <button className="primary-action" onClick={() => setChangelogModal({ version: versionActual || "4.0.0-beta.2.2", fecha: new Date().toISOString().slice(0, 10), tipo: "CORRECCION", titulo: "", detalle: "" })}><Plus/> Nueva entrada</button>
          </div>
        </div>
        <div className="products-card"><table>
          <thead><tr><th>Versión</th><th>Fecha</th><th>Tipo</th><th>Título</th><th>Detalle</th><th></th></tr></thead>
          <tbody>{changelog.map((c) => <tr key={c.id}>
            <td><code className="sa-version">{c.version}</code></td>
            <td>{fmtFecha(c.fecha)}</td>
            <td>{c.tipo === "NUEVO" ? <span className="sa-badge ok">NUEVO</span> : c.tipo === "CORRECCION" ? <span className="sa-badge off">CORRECCIÓN</span> : <span className="sa-badge ok">MEJORA</span>}</td>
            <td><strong>{c.titulo}</strong></td>
            <td>{c.detalle || "—"}</td>
            <td><div className="sa-row-actions">
              <button className="sa-icon-btn" title="Editar" onClick={() => setChangelogModal({ id: c.id, version: c.version, fecha: c.fecha, tipo: c.tipo, titulo: c.titulo, detalle: c.detalle || "" })}><Pencil size={15}/></button>
              <button className="sa-icon-btn" title="Eliminar" onClick={() => eliminarChangelog(c.id)}><Trash2 size={15}/></button>
            </div></td>
          </tr>)}</tbody></table>
          {!changelog.length && <div className="empty-table">Todavía no hay entradas. Cargá cada corrección que hagas para notificar a los clientes.</div>}
        </div>
      </div>}
    </main>

    {empresaModal && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={guardarEmpresa}>
      <div className="modal-head"><h3>{empresaModal.id ? "Editar empresa" : "Nueva empresa"}</h3><button type="button" onClick={() => setEmpresaModal(null)}><X/></button></div>
      <div className="form-grid">
        <label>Nombre<em>Clave única con la que se identifica</em><input required value={empresaModal.nombre} onChange={(e) => setEmpresaModal({ ...empresaModal, nombre: e.target.value })} /></label>
        <label>Razón social<input value={empresaModal.razonSocial || ""} onChange={(e) => setEmpresaModal({ ...empresaModal, razonSocial: e.target.value })} /></label>
        <label>CUIT<input value={empresaModal.cuit} onChange={(e) => setEmpresaModal({ ...empresaModal, cuit: e.target.value })} /></label>
        <label>Condición de IVA<select value={empresaModal.condicionIva} onChange={(e) => setEmpresaModal({ ...empresaModal, condicionIva: e.target.value })}>
          <option value="RESPONSABLE INSCRIPTO">Responsable Inscripto</option>
          <option value="MONOTRIBUTO">Monotributo</option>
          <option value="EXENTO">Exento</option>
          <option value="CONSUMIDOR FINAL">Consumidor Final</option>
        </select></label>
        <label>Dirección<input value={empresaModal.direccion || ""} onChange={(e) => setEmpresaModal({ ...empresaModal, direccion: e.target.value })} /></label>
        <label>Localidad<input value={empresaModal.localidad || ""} onChange={(e) => setEmpresaModal({ ...empresaModal, localidad: e.target.value })} /></label>
        <label>Provincia<input value={empresaModal.provincia || ""} onChange={(e) => setEmpresaModal({ ...empresaModal, provincia: e.target.value })} /></label>
        <label>Teléfono<input value={empresaModal.telefono || ""} onChange={(e) => setEmpresaModal({ ...empresaModal, telefono: e.target.value })} /></label>
        <label>Email<input value={empresaModal.email || ""} onChange={(e) => setEmpresaModal({ ...empresaModal, email: e.target.value })} /></label>
        <label>Versión instalada<em>Qué versión tiene este cliente instalada. El cliente verá si está actualizado o si tiene actualizaciones disponibles.</em><input value={empresaModal.versionInstalada || ""} onChange={(e) => setEmpresaModal({ ...empresaModal, versionInstalada: e.target.value })} placeholder="Ej: 4.0.0-beta.2.2" /></label>
        <label className="sa-check"><input type="checkbox" checked={empresaModal.activa !== false} onChange={(e) => setEmpresaModal({ ...empresaModal, activa: e.target.checked })} /> Empresa activa</label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setEmpresaModal(null)}>Cancelar</button><button className="primary-action">{empresaModal.id ? "Guardar cambios" : "Crear empresa"}</button></div>
    </form></div>}

    {usuarioModal && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={guardarUsuario}>
      <div className="modal-head"><h3>{usuarioModal.id ? "Editar usuario" : "Nuevo usuario"}</h3><button type="button" onClick={() => setUsuarioModal(null)}><X/></button></div>
      <div className="form-grid">
        <label>Nombre<input required value={usuarioModal.nombre} onChange={(e) => setUsuarioModal({ ...usuarioModal, nombre: e.target.value })} /></label>
        <label>Email (usuario de login)<input required type="email" value={usuarioModal.email} onChange={(e) => setUsuarioModal({ ...usuarioModal, email: e.target.value })} /></label>
        <label>Clave inicial<input required type="text" value={usuarioModal.password} onChange={(e) => setUsuarioModal({ ...usuarioModal, password: e.target.value })} /></label>
        <label>Empresa<select required value={usuarioModal.empresaId} onChange={(e) => setUsuarioModal({ ...usuarioModal, empresaId: e.target.value })}>{empresas.map((en) => <option key={en.id} value={en.id}>{en.nombre}</option>)}</select></label>
        <label>Rol<select value={usuarioModal.rol} onChange={(e) => setUsuarioModal({ ...usuarioModal, rol: e.target.value })}><option value="1">ADMIN</option><option value="3">VENDEDOR</option></select></label>
        <label className="sa-check"><input type="checkbox" checked={usuarioModal.activo !== false} onChange={(e) => setUsuarioModal({ ...usuarioModal, activo: e.target.checked })} /> Activo</label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setUsuarioModal(null)}>Cancelar</button><button className="primary-action">{usuarioModal.id ? "Guardar cambios" : "Crear usuario"}</button></div>
    </form></div>}

    {licenciaModal && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={guardarLicencia}>
      <div className="modal-head"><h3>Nueva licencia</h3><button type="button" onClick={() => setLicenciaModal(null)}><X/></button></div>
      <div className="form-grid">
        <label>Empresa<select required value={licenciaModal.empresaId} onChange={(e) => setLicenciaModal({ ...licenciaModal, empresaId: e.target.value })}>{empresas.map((en) => <option key={en.id} value={en.id}>{en.nombre}</option>)}</select></label>
        <label>Plan<select value={licenciaModal.plan} onChange={(e) => setLicenciaModal({ ...licenciaModal, plan: e.target.value })}><option value="MENSUAL">Mensual (1 mes)</option><option value="TRIMESTRAL">Trimestral (3 meses)</option><option value="DEFINITIVO">Definitivo</option></select></label>
        <label>Precio ($)<input type="number" min="0" step="0.01" value={licenciaModal.precio} onChange={(e) => setLicenciaModal({ ...licenciaModal, precio: e.target.value })} /></label>
        <label>Descuento (%)<em>Ej.: 10 = 10% de descuento</em><input type="number" min="0" max="100" step="0.01" value={licenciaModal.descuento} onChange={(e) => setLicenciaModal({ ...licenciaModal, descuento: e.target.value })} /></label>
        <label>Fecha de inicio<input type="date" value={licenciaModal.fechaInicio} onChange={(e) => setLicenciaModal({ ...licenciaModal, fechaInicio: e.target.value })} /></label>
        <label>Notas<input value={licenciaModal.notas || ""} onChange={(e) => setLicenciaModal({ ...licenciaModal, notas: e.target.value })} /></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setLicenciaModal(null)}>Cancelar</button><button className="primary-action">Registrar licencia</button></div>
    </form></div>}

    {claveModal && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={resetClave}>
      <div className="modal-head"><h3>Cambiar clave de {claveModal.nombre}</h3><button type="button" onClick={() => setClaveModal(null)}><X/></button></div>
      <div className="form-grid"><label>Nueva clave<input required type="text" value={claveModal.password} onChange={(e) => setClaveModal({ ...claveModal, password: e.target.value })} /></label></div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setClaveModal(null)}>Cancelar</button><button className="primary-action">Guardar clave</button></div>
    </form></div>}

    {fiscalModal && <div className="modal-backdrop"><form className="product-modal polished-modal product-tabs-modal" onSubmit={(e) => { e.preventDefault(); guardarFiscales(); }}>
      <div className="modal-head"><div><h3>Datos fiscales y ARCA — {fiscalModal.nombre}</h3><p>La empresa ve estos datos en solo lectura.</p></div><button type="button" onClick={() => setFiscalModal(null)}><X/></button></div>
      <div className="form-grid">
        <label className="full">Razón social<input required value={fiscalModal.data.razonSocial || ""} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, razonSocial: e.target.value } })} /></label>
        <label>CUIT<input value={fiscalModal.data.cuit || ""} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, cuit: e.target.value } })} /></label>
        <label>Inicio de actividades<input type="date" value={fiscalModal.data.inicioActividades || ""} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, inicioActividades: e.target.value } })} /></label>
        <label className="full">Domicilio<input value={fiscalModal.data.domicilio || ""} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, domicilio: e.target.value } })} /></label>
        <label>Teléfono<input value={fiscalModal.data.telefono || ""} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, telefono: e.target.value } })} /></label>
        <label>Email<input type="email" value={fiscalModal.data.email || ""} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, email: e.target.value } })} /></label>
        <label>Condición IVA<select value={fiscalModal.data.condicionIVA || "RESPONSABLE INSCRIPTO"} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, condicionIVA: e.target.value } })}><option>RESPONSABLE INSCRIPTO</option><option>MONOTRIBUTO</option><option>EXENTO</option></select></label>
        <label>Ambiente ARCA<select value={fiscalModal.data.arcaAmbiente || "HOMOLOGACION"} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, arcaAmbiente: e.target.value } })}><option value="HOMOLOGACION">Homologación</option><option value="PRODUCCION">Producción</option></select></label>
        <label className="full">Logo de la empresa (URL o data URL)<input value={fiscalModal.data.logoUrl || ""} onChange={(e) => setFiscalModal({ ...fiscalModal, data: { ...fiscalModal.data, logoUrl: e.target.value } })} /></label>
        <label className="full upload-field">
          <span className="label-icon"><FileKey2 size={16} /> Certificado ARCA (.crt)</span>
          <input type="file" accept=".crt,.cer,.pem" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirArchivoFiscal("cert", f); }} />
          <small>{fiscalModal.archivos.find((x: any) => x.tipo === "CERTIFICADO")?.nombre_original || "No cargado"} — {fiscalModal.conectado.certificado ? "conectado" : "no conectado"}</small>
        </label>
        <label className="full upload-field">
          <span className="label-icon"><KeyRound size={16} /> Llave privada ARCA (.key)</span>
          <input type="file" accept=".key,.pem" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirArchivoFiscal("key", f); }} />
          <small>{fiscalModal.archivos.find((x: any) => x.tipo === "LLAVE_PRIVADA")?.nombre_original || "No cargada"} — {fiscalModal.conectado.llave ? "conectada" : "no conectada"}</small>
        </label>
      </div>
      {fiscalModal.data.logoUrl && <img className="company-logo-preview" src={fiscalModal.data.logoUrl} />}
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setFiscalModal(null)}>Cancelar</button><button className="primary-action" disabled={loading}>Guardar datos fiscales</button></div>
    </form></div>}
    {changelogModal && <div className="modal-backdrop"><form className="product-modal polished-modal" onSubmit={guardarChangelog}>
      <div className="modal-head"><h3>{changelogModal.id ? "Editar entrada" : "Nueva entrada de novedades"}</h3><button type="button" onClick={() => setChangelogModal(null)}><X/></button></div>
      <div className="form-grid">
        <label>Versión<input required value={changelogModal.version} onChange={(e) => setChangelogModal({ ...changelogModal, version: e.target.value })} placeholder="Ej: 4.0.0-beta.2.2" /></label>
        <label>Fecha<input type="date" value={changelogModal.fecha} onChange={(e) => setChangelogModal({ ...changelogModal, fecha: e.target.value })} /></label>
        <label>Tipo<select value={changelogModal.tipo} onChange={(e) => setChangelogModal({ ...changelogModal, tipo: e.target.value })}><option value="NUEVO">Nuevo</option><option value="CORRECCION">Corrección</option><option value="MEJORA">Mejora</option></select></label>
        <label className="full">Título<input required value={changelogModal.titulo} onChange={(e) => setChangelogModal({ ...changelogModal, titulo: e.target.value })} placeholder="Ej: Se corrigió el registro de cobro en caja" /></label>
        <label className="full">Detalle<textarea value={changelogModal.detalle} onChange={(e) => setChangelogModal({ ...changelogModal, detalle: e.target.value })} placeholder="Explicación breve para el cliente..." rows={3} /></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setChangelogModal(null)}>Cancelar</button><button className="primary-action" disabled={loading}>Guardar</button></div>
    </form></div>}
  </div>;
}