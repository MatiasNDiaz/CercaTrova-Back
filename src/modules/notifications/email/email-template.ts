const LOGO_URL = 'https://res.cloudinary.com/dmvybzxnv/image/upload/v1768176230/properties/ctflc5qkaoitg2aas6ht.jpg';
const BRAND_GREEN = '#0b7a4b';
const BRAND_LIGHT = '#e8f5ee';
const BASE_URL = 'https://cercatrova.com'; // 👈 cambiá por tu URL real

const STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  enviado:     { label: 'Recibida',    color: '#3b82f6', emoji: '📩' },
  en_revision: { label: 'En revisión', color: '#f59e0b', emoji: '🔍' },
  aceptado:    { label: 'Aceptada',    color: '#10b981', emoji: '✅' },
  rechazado:   { label: 'Rechazada',   color: '#ef4444', emoji: '❌' },
};

export const EmailTemplates = {

  // ── WRAPPER BASE ──────────────────────────────────────────────────────────
  wrapper: (content: string, ctaUrl?: string, ctaLabel?: string) => `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0; padding:0; background-color:#f0f4f0; font-family:'Helvetica Neue', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f0; padding:40px 20px;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

            <!-- BANNER HEADER -->
            <tr>
              <td style="background:linear-gradient(135deg, #0b7a4b 0%, #0f8c58 100%); border-radius:16px 16px 0 0; padding:32px 40px; text-align:center;">
                <img src="${LOGO_URL}" alt="CercaTrova" style="height:60px; width:auto; display:inline-block; margin-bottom:16px; border-radius:8px;" />
                <p style="color:rgba(255,255,255,0.85); font-size:13px; margin:0; letter-spacing:2px; text-transform:uppercase; font-weight:600;">Inmobiliaria CercaTrova</p>
              </td>
            </tr>

            <!-- CONTENIDO -->
            <tr>
              <td style="background:#ffffff; padding:40px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
                ${content}

                ${ctaUrl && ctaLabel ? `
                <div style="text-align:center; margin-top:32px;">
                  <a href="${ctaUrl}" target="_blank"
                    style="display:inline-block; background:linear-gradient(135deg, #0b7a4b, #0f8c58); color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:10px; font-size:15px; font-weight:700; letter-spacing:0.3px; box-shadow:0 4px 12px rgba(11,122,75,0.3);">
                    ${ctaLabel} →
                  </a>
                </div>` : ''}
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background:#f8faf8; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 16px 16px; padding:24px 40px; text-align:center;">
                <p style="color:#6b7280; font-size:13px; margin:0 0 12px 0;">Seguinos y contactanos</p>
                <div style="margin-bottom:16px;">
                  <a href="https://www.instagram.com/inmobiliariacercatrova/" target="_blank"
                    style="display:inline-block; margin:0 8px; background:#ffffff; border:1px solid #e5e7eb; color:#0b7a4b; text-decoration:none; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:600;">
                    📷 Instagram
                  </a>
                  <a href="https://wa.me/5493515067576" target="_blank"
                    style="display:inline-block; margin:0 8px; background:#ffffff; border:1px solid #e5e7eb; color:#0b7a4b; text-decoration:none; padding:8px 18px; border-radius:8px; font-size:13px; font-weight:600;">
                    💬 WhatsApp
                  </a>
                </div>
                <p style="color:#9ca3af; font-size:12px; margin:0;">© CercaTrova Inmobiliaria — Mensaje automático, no responder este correo.</p>
              </td>
            </tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `,

  // ── HELPER: imagen de propiedad ───────────────────────────────────────────
  renderImages: (urls: string[]) =>
    urls.length === 0 ? '' : `
      <div style="margin-top:20px; border-radius:10px; overflow:hidden;">
        <img src="${urls[0]}" alt="Imagen propiedad"
          style="width:100%; height:220px; object-fit:cover; display:block; border-radius:10px;" />
      </div>`,

  // ── HELPER: card de propiedad ─────────────────────────────────────────────
  propertyCard: (title: string, location: string, price: number, operationType: string) => `
    <div style="background:#f8faf8; border:1px solid #e5e7eb; border-left:4px solid ${BRAND_GREEN}; border-radius:10px; padding:20px; margin:20px 0;">
      <div style="margin-bottom:10px;">
        <span style="background:${BRAND_GREEN}; color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:1px;">
          ${operationType}
        </span>
      </div>
      <p style="font-size:17px; font-weight:700; color:#111827; margin:8px 0 4px 0;">${title}</p>
      <p style="color:#6b7280; font-size:14px; margin:4px 0;">📍 ${location}</p>
      <p style="color:${BRAND_GREEN}; font-size:18px; font-weight:700; margin:8px 0 0 0;">USD ${price.toLocaleString('es-AR')}</p>
    </div>
  `,

  // ── 1. NUEVA PROPIEDAD (GLOBAL) ───────────────────────────────────────────
  newProperty: (title: string, location: string, price: number, images: string[], operationType: string) =>
    EmailTemplates.wrapper(
      `
      <h2 style="color:#111827; font-size:22px; font-weight:700; margin:0 0 8px 0;">
        🏠 Nueva propiedad publicada
      </h2>
      <p style="color:#6b7280; font-size:15px; margin:0 0 20px 0; line-height:1.6;">
        Se agregó una nueva propiedad a nuestro catálogo. ¡No te la pierdas!
      </p>
      ${EmailTemplates.propertyCard(title, location, price, operationType)}
      ${EmailTemplates.renderImages(images)}
      `,
      `${BASE_URL}/properties`,
      'Ver todas las propiedades'
    ),

  // ── 2. MATCH CON PREFERENCIAS ─────────────────────────────────────────────
  matchSearch: (
    userName: string, title: string, location: string, price: number,
    images: string[], matchedCharacteristics: string[],
    matchedCount: number, totalCount: number, operationType: string,
  ) =>
    EmailTemplates.wrapper(
      `
      <h2 style="color:#111827; font-size:22px; font-weight:700; margin:0 0 8px 0;">
        ✨ ¡Encontramos algo para vos, ${userName}!
      </h2>
      <p style="color:#6b7280; font-size:15px; margin:0 0 16px 0; line-height:1.6;">
        Esta propiedad cumple <strong style="color:${BRAND_GREEN};">${matchedCount} de ${totalCount}</strong> características que buscás.
      </p>

      <div style="margin-bottom:20px; display:flex; flex-wrap:wrap; gap:6px;">
        ${matchedCharacteristics.map(c => `
          <span style="display:inline-block; background:${BRAND_LIGHT}; color:${BRAND_GREEN}; border:1px solid #b6deca; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; margin:3px 3px 0 0;">
            ✓ ${c}
          </span>
        `).join('')}
      </div>

      ${EmailTemplates.propertyCard(title, location, price, operationType)}
      ${EmailTemplates.renderImages(images)}
      `,
      `${BASE_URL}/properties`,
      'Ver propiedad'
    ),

  // ── 3. BAJA DE PRECIO ─────────────────────────────────────────────────────
  priceDrop: (title: string, zone: string, oldPrice: number, newPrice: number, images: string[]) => {
    const saving = oldPrice - newPrice;
    const pct    = Math.round((saving / oldPrice) * 100);
    return EmailTemplates.wrapper(
      `
      <h2 style="color:#111827; font-size:22px; font-weight:700; margin:0 0 8px 0;">
        📉 ¡Bajó el precio!
      </h2>
      <p style="color:#6b7280; font-size:15px; margin:0 0 20px 0; line-height:1.6;">
        Una propiedad que podría interesarte redujo su precio.
      </p>

      <div style="background:#f8faf8; border:1px solid #e5e7eb; border-left:4px solid #f59e0b; border-radius:10px; padding:20px; margin-bottom:20px;">
        <p style="font-size:17px; font-weight:700; color:#111827; margin:0 0 6px 0;">${title}</p>
        <p style="color:#6b7280; font-size:14px; margin:0 0 16px 0;">📍 ${zone}</p>
        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <div>
            <p style="color:#9ca3af; font-size:12px; margin:0 0 2px 0; text-transform:uppercase; letter-spacing:1px;">Precio anterior</p>
            <p style="color:#9ca3af; font-size:16px; font-weight:600; text-decoration:line-through; margin:0;">USD ${oldPrice.toLocaleString('es-AR')}</p>
          </div>
          <div style="font-size:20px; color:#9ca3af;">→</div>
          <div>
            <p style="color:#9ca3af; font-size:12px; margin:0 0 2px 0; text-transform:uppercase; letter-spacing:1px;">Nuevo precio</p>
            <p style="color:#10b981; font-size:22px; font-weight:800; margin:0;">USD ${newPrice.toLocaleString('es-AR')}</p>
          </div>
        </div>
        <div style="margin-top:14px; display:inline-block; background:#fef3c7; border:1px solid #fcd34d; color:#92400e; padding:5px 14px; border-radius:20px; font-size:13px; font-weight:700;">
          🎉 Ahorrás USD ${saving.toLocaleString('es-AR')} (${pct}% menos)
        </div>
      </div>

      ${EmailTemplates.renderImages(images)}
      `,
      `${BASE_URL}/properties`,
      'Ver propiedad'
    );
  },

  // ── 4. CAMBIO DE ESTADO DE SOLICITUD ─────────────────────────────────────
  requestStatusChange: (
    userName: string, direccion: string, barrio: string,
    localidad: string, status: string, title: string, message: string,
  ) => {
    const cfg = STATUS_LABELS[status] ?? { label: status, color: BRAND_GREEN, emoji: '📋' };

    const extraBlock =
      status === 'aceptado' ? `
        <div style="margin-top:20px; background:#d1fae5; border:1px solid #6ee7b7; border-radius:10px; padding:16px 20px; text-align:center;">
          <p style="color:#065f46; font-weight:700; font-size:14px; margin:0;">📞 Un agente se pondrá en contacto con vos a la brevedad</p>
        </div>` :
      status === 'rechazado' ? `
        <div style="margin-top:20px; background:#fee2e2; border:1px solid #fca5a5; border-radius:10px; padding:16px 20px; text-align:center;">
          <p style="color:#991b1b; font-size:13px; margin:0;">Si tenés dudas, contactanos por WhatsApp o Instagram.</p>
        </div>` : '';

    return EmailTemplates.wrapper(
      `
      <h2 style="color:#111827; font-size:22px; font-weight:700; margin:0 0 8px 0;">
        Actualización de tu solicitud
      </h2>
      <p style="color:#6b7280; font-size:15px; margin:0 0 24px 0; line-height:1.6;">
        Hola <strong style="color:#111827;">${userName}</strong>, hay novedades sobre tu solicitud:
      </p>

      <div style="background:#f8faf8; border:1px solid #e5e7eb; border-left:4px solid ${cfg.color}; border-radius:10px; padding:20px; margin-bottom:20px;">
        <p style="font-size:15px; color:#374151; font-weight:600; margin:0 0 4px 0;">📍 ${direccion}</p>
        <p style="color:#6b7280; font-size:13px; margin:0 0 16px 0;">${barrio}, ${localidad}</p>
        <div style="display:inline-block; background:${cfg.color}; color:#fff; padding:6px 18px; border-radius:20px; font-size:14px; font-weight:700;">
          ${cfg.emoji} ${cfg.label}
        </div>
      </div>

      <p style="color:#374151; font-size:14px; line-height:1.7; margin:0;">${message}</p>
      ${extraBlock}
      `,
      `${BASE_URL}/dashboard/notificaciones`,
      'Ver mis solicitudes'
    );
  },

  // ── 5. MENSAJE GLOBAL ─────────────────────────────────────────────────────
  globalMessage: (content: string) =>
    EmailTemplates.wrapper(
      `
      <h2 style="color:#111827; font-size:22px; font-weight:700; margin:0 0 16px 0;">
        📢 Mensaje de CercaTrova
      </h2>
      <p style="color:#374151; font-size:15px; line-height:1.7; margin:0;">${content}</p>
      `,
      `${BASE_URL}`,
      'Ir al sitio'
    ),
};