const LOGO_URL = 'https://res.cloudinary.com/dmvybzxnv/image/upload/v1768176230/properties/ctflc5qkaoitg2aas6ht.jpg';
const BRAND_GREEN = '#0b7a4b';

const STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  enviado:     { label: 'Recibida',     color: '#3b82f6', emoji: '📩' },
  en_revision: { label: 'En revisión',  color: '#f59e0b', emoji: '🔍' },
  aceptado:    { label: 'Aceptada',     color: '#10b981', emoji: '✅' },
  rechazado:   { label: 'Rechazada',    color: '#ef4444', emoji: '❌' },
};

export const EmailTemplates = {
  wrapper: (content: string) => `
    <div style="width:100%; background:#f1f1f1; padding:30px 0; font-family:Arial, sans-serif;">
      <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; padding:25px; box-shadow:0 4px 12px rgba(0,0,0,0.08);">
        <div style="text-align:center; padding:10px 0 20px 0;">
          <img src="${LOGO_URL}" alt="CercaTrova Inmobiliaria" style="width:200px; height:auto; display:inline-block; border:none;" />
        </div>
        ${content}
        <div style="margin-top:30px; text-align:center; border-top:1px solid #eee; padding-top:20px;">
          <p style="color:#555; margin-bottom:10px; font-size:14px;">Seguinos y contactanos</p>
          <a href="https://www.instagram.com/inmobiliariacercatrova/" target="_blank" style="margin-right:15px; text-decoration:none; color:${BRAND_GREEN}; font-weight:bold;">📷 Instagram</a>
          <a href="https://wa.me/5493515067576" target="_blank" style="text-decoration:none; color:${BRAND_GREEN}; font-weight:bold;">💬 WhatsApp</a>
        </div>
      </div>
      <p style="text-align:center; color:#888; margin-top:15px; font-size:12px;">© CercaTrova Inmobiliaria — Mensaje automático</p>
    </div>
  `,

  renderImages: (urls: string[]) =>
    urls.length === 0 ? '' : `
      <div style="margin-top:20px;">
        <img src="${urls[0]}" alt="Imagen propiedad" style="width:100%; border-radius:10px; display:block;" />
      </div>`,

  // ── NUEVA PROPIEDAD (GLOBAL) ──
  newProperty: (title: string, location: string, price: number, images: string[], operationType: string) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN}; margin-bottom:5px;">Nueva propiedad publicada</h2>
      <div style="display:inline-block; background:${BRAND_GREEN}; color:white; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:15px;">${operationType}</div>
      <p style="color:#555; font-size:15px;">Se agregó una nueva propiedad a nuestro catálogo:</p>
      <div style="margin:20px 0; padding:15px; background:#f8f9fa; border-radius:8px; border-left:4px solid ${BRAND_GREEN};">
        <p style="font-size:16px; margin:4px 0;"><strong style="color:${BRAND_GREEN};">${title}</strong></p>
        <p style="color:#555; margin:4px 0;">Ubicación: <strong>${location}</strong></p>
        <p style="color:#555; margin:4px 0;">Precio: <strong style="color:${BRAND_GREEN};">$${price.toLocaleString()}</strong></p>
      </div>
      ${EmailTemplates.renderImages(images)}
    `),

  // ── MATCH CON PREFERENCIAS ──
  matchSearch: (userName: string, title: string, location: string, price: number, images: string[], matchedCharacteristics: string[], matchedCount: number, totalCount: number, operationType: string) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN}; font-size:18px; font-weight:bold;">¡Tenemos una propiedad para vos, ${userName}!</h2>
      <div style="display:inline-block; background:${BRAND_GREEN}; color:white; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:bold; text-transform:uppercase; margin:10px 0;">${operationType}</div>
      <p style="font-size:16px; font-weight:bold; color:#222; margin-top:10px;">Esta propiedad cumple ${matchedCount} de las ${totalCount} características que buscás.</p>
      <div style="margin:10px 0;">${matchedCharacteristics.map(c => `<span style="display:inline-block; background:${BRAND_GREEN}; color:white; padding:2px 8px; border-radius:4px; font-size:12px; margin:3px;">✅ ${c}</span>`).join('')}</div>
      <div style="margin:20px 0; padding:15px; background:#f8f9fa; border-radius:8px;">
        <p style="font-size:16px; margin:4px 0;"><strong style="color:${BRAND_GREEN};">${title}</strong></p>
        <p style="color:#555; margin:4px 0;">Ubicación: <strong>${location}</strong></p>
        <p style="color:#555; margin:4px 0;">Precio: <strong>$${price.toLocaleString()}</strong></p>
      </div>
      ${EmailTemplates.renderImages(images)}
    `),

  // ── BAJA DE PRECIO ──
  priceDrop: (title: string, zone: string, oldPrice: number, newPrice: number, images: string[]) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN};">¡Una propiedad bajó de precio!</h2>
      <p style="color:#555;">La siguiente propiedad redujo su valor:</p>
      <div style="margin:20px 0; padding:15px; background:#f8f9fa; border-radius:8px;">
        <p><strong>${title}</strong></p>
        <p>Zona: <strong>${zone}</strong></p>
        <p>Antes: <span style="text-decoration:line-through; color:#999;">$${oldPrice.toLocaleString()}</span></p>
        <p style="color:#10b981; font-size:18px; font-weight:bold;">Ahora: $${newPrice.toLocaleString()}</p>
        <p style="color:#ef4444; font-size:13px;">Ahorrás: $${(oldPrice - newPrice).toLocaleString()}</p>
      </div>
      ${EmailTemplates.renderImages(images)}
    `),

  // ── CAMBIO DE ESTADO DE SOLICITUD ── (NUEVO)
  requestStatusChange: (userName: string, direccion: string, barrio: string, localidad: string, status: string, title: string, message: string) => {
    const cfg = STATUS_LABELS[status] ?? { label: status, color: BRAND_GREEN, emoji: '📋' };
    return EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN};">Actualización de tu solicitud</h2>
      <p style="color:#555; font-size:15px;">Hola <strong>${userName}</strong>, hay novedades sobre tu solicitud:</p>

      <div style="margin:20px 0; padding:20px; background:#f8f9fa; border-radius:8px; border-left:4px solid ${cfg.color};">
        <p style="font-size:15px; margin:4px 0; color:#333;"><strong>Propiedad:</strong> ${direccion}</p>
        <p style="font-size:14px; margin:4px 0; color:#555;">${barrio}, ${localidad}</p>
        <div style="margin-top:12px;">
          <span style="display:inline-block; background:${cfg.color}; color:white; padding:5px 14px; border-radius:20px; font-size:13px; font-weight:bold;">
            ${cfg.emoji} ${cfg.label}
          </span>
        </div>
      </div>

      <p style="color:#555; font-size:14px; line-height:1.6;">${message}</p>

      ${status === 'aceptado' ? `
        <div style="margin-top:20px; padding:15px; background:#d1fae5; border-radius:8px; text-align:center;">
          <p style="color:#065f46; font-weight:bold; margin:0;">Un agente se pondrá en contacto con vos a la brevedad 📞</p>
        </div>
      ` : ''}

      ${status === 'rechazado' ? `
        <div style="margin-top:20px; padding:15px; background:#fee2e2; border-radius:8px; text-align:center;">
          <p style="color:#991b1b; font-size:13px; margin:0;">Si tenés dudas, podés contactarnos por WhatsApp o Instagram.</p>
        </div>
      ` : ''}
    `);
  },

  // ── MENSAJE GLOBAL ──
  globalMessage: (content: string) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN};">Mensaje de CercaTrova</h2>
      <p style="color:#555; font-size:15px; line-height:1.5;">${content}</p>
    `),
};