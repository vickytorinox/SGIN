/**
 * Plantillas por tipo de objetivo. Al crear un objetivo se copia la plantilla en su config,
 * y desde Admin Spartan se ajusta campo por campo.
 *
 * Campos fijos (no configurables) en categorías de persona: nro_doc, nombre, apellido.
 * En country además: "quién autoriza" (y lote/apellido si autoriza un residente).
 */

const TIPOS_CAMPO = ['texto', 'numero', 'lista', 'texto_largo', 'foto', 'patente', 'fecha'];

const PLANTILLAS = {
  country: {
    tipo: 'country',
    modo_salida: 'cerrar',             // la salida cierra el ingreso ("Adentro ahora")
    etiquetas: { lote: 'Lote' },
    autoriza: ['Residente', 'Administración', 'Intendencia'],
    modulos: { cacheo: { activo: false, momento: 'egreso', obligatoria: false, aleatorio_cada: 0 }, acompanantes: true },
    categorias: [
      {
        key: 'visita', label: 'Visita', persona: true, estados: false, estado_default: 'EVENTUAL',
        campos: [
          { key: 'patente', label: 'Patente', tipo: 'patente', visible: true, obligatorio: false },
          { key: 'motivo', label: 'Motivo', tipo: 'texto', visible: true, obligatorio: false },
          { key: 'telefono', label: 'Teléfono', tipo: 'numero', visible: false, obligatorio: false }
        ],
        docs: [{ key: 'autorizacion', label: 'Autorización de ingreso', vigencia_meses: 0, bloquea: false }]
      },
      {
        key: 'empleado', label: 'Empleado / Servicio', persona: true, estados: true, estado_default: 'AUTORIZADO',
        campos: [
          { key: 'subtipo', label: 'Tipo de servicio', tipo: 'lista', opciones: ['Doméstico', 'Jardinería', 'Pileta', 'Niñera', 'Otro'], visible: true, obligatorio: true },
          { key: 'patente', label: 'Patente', tipo: 'patente', visible: true, obligatorio: false },
          { key: 'motivo', label: 'Motivo', tipo: 'texto', visible: true, obligatorio: false },
          { key: 'telefono', label: 'Teléfono', tipo: 'numero', visible: true, obligatorio: true }
        ],
        docs: [
          { key: 'seguro_vida', label: 'Póliza de seguro de vida', vigencia_meses: 12, bloquea: true },
          { key: 'seguro_auto', label: 'Seguro del automóvil', vigencia_meses: 12, bloquea: false }
        ]
      },
      {
        key: 'contratista', label: 'Contratista', persona: true, estados: true, estado_default: 'AUTORIZADO',
        campos: [
          { key: 'empresa', label: 'Empresa o contratista', tipo: 'texto', visible: true, obligatorio: true },
          { key: 'trabajo', label: 'Trabajo a realizar', tipo: 'texto', visible: true, obligatorio: true },
          { key: 'patente', label: 'Patente', tipo: 'patente', visible: true, obligatorio: true },
          { key: 'motivo', label: 'Motivo', tipo: 'texto', visible: false, obligatorio: false },
          { key: 'telefono', label: 'Teléfono', tipo: 'numero', visible: true, obligatorio: true }
        ],
        docs: [
          { key: 'seguro_vida', label: 'Póliza de seguro de vida', vigencia_meses: 12, bloquea: true },
          { key: 'seguro_auto', label: 'Seguro del automóvil', vigencia_meses: 12, bloquea: false }
        ]
      }
    ]
  },

  control_personal: {
    tipo: 'control_personal',
    modo_salida: 'registro',           // ingreso y egreso son registros separados (como SG Rock)
    etiquetas: {},
    autoriza: [],
    modulos: { cacheo: { activo: true, momento: 'egreso', obligatoria: true, aleatorio_cada: 0 }, acompanantes: false },
    categorias: [
      {
        key: 'personal', label: 'Personal', persona: true, estados: false, estado_default: 'AUTORIZADO', cacheo: true,
        campos: [
          { key: 'observaciones', label: 'Observaciones', tipo: 'texto_largo', visible: true, obligatorio: false }
        ],
        docs: []
      },
      {
        key: 'mercaderia', label: 'Mercadería', persona: false,
        campos: [
          { key: 'proveedor', label: 'Proveedor', tipo: 'texto', visible: true, obligatorio: true },
          { key: 'remito', label: 'N.º de remito', tipo: 'texto', visible: true, obligatorio: false },
          { key: 'chofer_dni', label: 'DNI chofer', tipo: 'numero', visible: true, obligatorio: true, chofer: true },
          { key: 'chofer_nombre', label: 'Nombre chofer', tipo: 'texto', visible: true, obligatorio: true },
          { key: 'patente', label: 'Patente', tipo: 'patente', visible: true, obligatorio: false },
          { key: 'bultos', label: 'Bultos', tipo: 'numero', visible: true, obligatorio: false },
          { key: 'descripcion', label: 'Descripción', tipo: 'texto', visible: true, obligatorio: false },
          { key: 'foto_remito', label: 'Foto del remito', tipo: 'foto', visible: true, obligatorio: false }
        ],
        docs: []
      },
      {
        key: 'residuos', label: 'Retiro de residuos', persona: false,
        campos: [
          { key: 'empresa', label: 'Empresa', tipo: 'texto', visible: true, obligatorio: true },
          { key: 'chofer_dni', label: 'DNI chofer', tipo: 'numero', visible: true, obligatorio: true, chofer: true },
          { key: 'chofer_nombre', label: 'Nombre chofer', tipo: 'texto', visible: true, obligatorio: true },
          { key: 'patente', label: 'Patente', tipo: 'patente', visible: true, obligatorio: false },
          { key: 'tipo_residuo', label: 'Tipo de residuo', tipo: 'lista', opciones: ['Orgánico', 'Reciclable', 'Aceite usado', 'Otro'], visible: true, obligatorio: true },
          { key: 'cantidad', label: 'Cantidad', tipo: 'texto', visible: true, obligatorio: false },
          { key: 'foto_carga', label: 'Foto de la carga', tipo: 'foto', visible: true, obligatorio: false }
        ],
        docs: []
      },
      {
        key: 'otro', label: 'Otro', persona: false,
        campos: [
          { key: 'descripcion', label: 'Descripción', tipo: 'texto_largo', visible: true, obligatorio: true },
          { key: 'chofer_dni', label: 'DNI (opcional)', tipo: 'numero', visible: true, obligatorio: false, chofer: true },
          { key: 'chofer_nombre', label: 'Nombre (opcional)', tipo: 'texto', visible: true, obligatorio: false },
          { key: 'foto_otro', label: 'Foto', tipo: 'foto', visible: true, obligatorio: false }
        ],
        docs: []
      }
    ]
  }
};

function plantilla_(tipo) {
  const p = PLANTILLAS[tipo];
  if (!p) throw apiError_('tipo_invalido', 'Tipo de objetivo desconocido: ' + tipo);
  return JSON.parse(JSON.stringify(p));
}

/**
 * Normaliza y valida una config: completa lo que falte desde la plantilla,
 * respeta lo configurable y nunca permite quitar campos fijos.
 */
function normalizarConfig_(cfg, tipo, incluirInactivos) {
  const base = plantilla_(tipo || (cfg && cfg.tipo) || 'country');
  if (!cfg) return base;
  const out = base;
  out.etiquetas = Object.assign({}, base.etiquetas, cfg.etiquetas || {});
  Object.keys(out.etiquetas).forEach(k => { out.etiquetas[k] = txt_(out.etiquetas[k], 40) || base.etiquetas[k]; });
  if (cfg.modulos && cfg.modulos.cacheo) {
    const c = cfg.modulos.cacheo;
    out.modulos.cacheo = {
      activo: !!c.activo,
      momento: ['ingreso', 'egreso', 'ambos'].indexOf(c.momento) >= 0 ? c.momento : 'egreso',
      obligatoria: !!c.obligatoria,
      aleatorio_cada: Math.max(0, Math.min(50, Number(c.aleatorio_cada) || 0))
    };
  }
  (cfg.categorias || []).forEach(cc => {
    const cat = out.categorias.filter(x => x.key === cc.key)[0];
    if (!cat) return;
    // campos base: solo visible / obligatorio / label / opciones
    (cc.campos || []).forEach(f => {
      const b = cat.campos.filter(x => x.key === f.key)[0];
      if (b) {
        b.visible = !!f.visible;
        b.obligatorio = !!f.visible && !!f.obligatorio;
        if (f.label) b.label = txt_(f.label, 40);
        if (Array.isArray(f.opciones) && b.tipo === 'lista') b.opciones = f.opciones.map(o => txt_(o, 40)).filter(Boolean).slice(0, 20);
      } else if (f.extra && cat.campos.filter(x => x.extra).length < 6) {
        const tipoOk = TIPOS_CAMPO.indexOf(f.tipo) >= 0 ? f.tipo : 'texto';
        const key = 'x_' + String(f.key || '').replace(/^x_/, '').replace(/[^a-z0-9_]/gi, '').slice(0, 30);
        if (key === 'x_') return;
        cat.campos.push({
          key: key, label: txt_(f.label, 40) || 'Campo', tipo: tipoOk, extra: true,
          opciones: tipoOk === 'lista' ? (f.opciones || []).map(o => txt_(o, 40)).filter(Boolean).slice(0, 20) : undefined,
          visible: !!f.visible, obligatorio: !!f.visible && !!f.obligatorio
        });
      }
    });
    (cc.docs || []).forEach(d => {
      const b = cat.docs.filter(x => x.key === d.key)[0];
      if (b) {
        b.bloquea = !!d.bloquea;
        b.vigencia_meses = Math.max(0, Math.min(60, Number(d.vigencia_meses) || 0));
        b.activo = d.activo !== false;
      }
    });
    if (!incluirInactivos) cat.docs = cat.docs.filter(d => d.activo !== false);
    if (cc.estado_default && ['AUTORIZADO', 'EVENTUAL'].indexOf(cc.estado_default) >= 0) cat.estado_default = cc.estado_default;
    cat.activa = cc.activa !== false;
  });
  if (!incluirInactivos) out.categorias = out.categorias.filter(c => c.activa !== false);
  return out;
}
