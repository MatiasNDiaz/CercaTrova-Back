const LOGO_URL = 'https://res.cloudinary.com/dmvybzxnv/image/upload/v1785452888/logo-cercatrova-email_qlwxhv.png';
const BRAND_GREEN = '#0b7a4b';
const BRAND_LIGHT = '#e8f5ee';
const BRAND_BORDER = '#b6deca'; // borde de los bloques verdes claros
const INK = '#111827';          // texto principal
const MUTED = '#6b7280';        // texto secundario
const HAIRLINE = '#e0e8e2';     // divisorias internas de la ficha técnica
const BASE_URL = 'https://cercatrova.com'; // 👈 cambiá por tu URL real

const STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  enviado:     { label: 'Recibida',    color: '#3b82f6', emoji: '📩' },
  en_revision: { label: 'En revisión', color: '#f59e0b', emoji: '🔍' },
  aceptado:    { label: 'Aceptada',    color: '#10b981', emoji: '✅' },
  rechazado:   { label: 'Rechazada',   color: '#ef4444', emoji: '❌' },
};

/**
 * Íconos de la ficha técnica, indexados por la etiqueta que arma
 * `NotificationService.propertySpecs()`.
 *
 * Se usan EMOJIS y no SVG ni íconos de fuente: los primeros son texto Unicode y
 * los renderiza cualquier cliente, mientras que un `<svg>` inline lo descarta
 * Outlook y una @font-face no carga en casi ningún webmail. Una etiqueta sin
 * ícono simplemente no muestra ninguno (`?? ''`), así que agregar specs nuevos
 * nunca rompe la grilla.
 */
const SPEC_ICONS: Record<string, string> = {
  'Tipo':          '🏠',
  'Ambientes':     '🛋️',
  'Baños':         '🚿',
  'Sup. Total':    '📐',
  'Sup. Cubierta': '🧱',
  'Antigüedad':    '📅',
};

/** Largo máximo de la descripción en el email: alcanza para engancharla y el resto se lee en el sitio. */
const DESCRIPTION_MAX = 340;

/**
 * Pide la foto ya recortada al CDN en vez de recortarla con CSS.
 *
 * `object-fit` no existe en Outlook, así que una foto vertical forzada a una
 * altura fija sale estirada. Cloudinary la entrega con la proporción exacta
 * (`c_fill`), y como todas las fotos llegan con la MISMA proporción las
 * miniaturas quedan parejas sin necesidad de forzarles el alto.
 *
 * `f_jpg` además baja muchísimo el peso del email (una foto de 1200px pasa de
 * ~430 KB en PNG a ~95 KB) y es el único formato que renderiza absolutamente
 * cualquier cliente — a diferencia de `f_auto`, que puede devolver AVIF/WebP
 * según un header `Accept` que los clientes de email no siempre mandan bien.
 *
 * Si la URL no es de Cloudinary se devuelve intacta.
 */
const cropped = (url: string, width: number, height: number) =>
  url.includes('/image/upload/')
    ? url.replace('/image/upload/', `/image/upload/w_${width},h_${height},c_fill,q_auto,f_jpg/`)
    : url;

/** Texto libre cargado por el admin: se escapa para que un `<` no rompa el maquetado. */
const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Recorta en el último espacio antes del tope, para no cortar una palabra al medio. */
const truncate = (text: string, max: number) => {
  const limpio = text.trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return `${(ultimoEspacio > max * 0.6 ? corte.slice(0, ultimoEspacio) : corte).trimEnd()}…`;
};

/**
 * Un botón del pie del email.
 *
 * Armado con `<table>` y no con un `<a>` suelto: el padding vertical sobre un
 * `<a>` lo ignora el motor de Word (Outlook) y el botón queda finito. Con el
 * padding en el `<td>` el alto es real en todos los clientes. La sombra la
 * aplican Apple Mail y los webmail; donde no se soporta simplemente no aparece
 * y el botón sigue viéndose igual de sólido.
 *
 * `display:inline-block` en la tabla es lo que permite que dos botones se
 * acomoden solos: entran uno al lado del otro si hay ancho, y si no se apilan
 * (ver `ctaGroup`).
 *
 * El secundario lleva 2px de borde y 2px MENOS de padding que el primario, así
 * los dos terminan con exactamente la misma caja y quedan parejos al ponerlos
 * lado a lado.
 */
const ctaButton = (
  url: string,
  label: string,
  { primary = true, padding = '18px 46px' }: { primary?: boolean; padding?: string } = {},
) => {
  const caja = primary
    ? `background-color:${BRAND_GREEN}; background-image:linear-gradient(135deg, #0b7a4b, #0f8c58); box-shadow:0 6px 18px rgba(11,122,75,0.35);`
    : `background-color:#ffffff; border:2px solid ${BRAND_GREEN};`;

  return `
                <table cellpadding="0" cellspacing="0" border="0" align="center" style="display:inline-block; vertical-align:top; margin:0 6px 12px 6px;">
                  <tr>
                    <td align="center" style="${caja} border-radius:12px; padding:${padding};">
                      <a href="${url}" target="_blank"
                        style="display:block; color:${primary ? '#ffffff' : BRAND_GREEN}; text-decoration:none; font-size:17px; font-weight:800; letter-spacing:0.4px; font-family:'Helvetica Neue', Arial, sans-serif; white-space:nowrap;">
                        ${label}${primary ? ' →' : ''}
                      </a>
                    </td>
                  </tr>
                </table>`;
};

/**
 * El bloque de botones del pie: uno o dos.
 *
 * ⚠️ Con DOS botones no se puede usar una tabla de 2 columnas fija. En 600px
 * entran cómodos, pero el email se ve mayormente en el celular, donde el ancho
 * útil baja a ~250px: una tabla de 2 columnas ahí no se apila, achica las
 * celdas y parte los textos en dos renglones ilegibles. Y las media queries no
 * son opción porque Gmail (app y webmail) las descarta.
 *
 * La solución es que los botones sean tablas `inline-block`: fluyen como texto,
 * quedan lado a lado mientras haya ancho y se apilan solos cuando no entran, sin
 * una sola media query.
 *
 * Outlook de escritorio es el único que ignora `inline-block`; para ese caso van
 * los comentarios condicionales `[if mso]`, que le dan la tabla de 2 columnas de
 * verdad. Los demás clientes los leen como comentarios HTML y los ignoran.
 */
const ctaGroup = (
  primaryUrl: string,
  primaryLabel: string,
  secondary?: { url: string; label: string },
) => {
  if (!secondary) {
    return `
              <div style="text-align:center; margin-top:36px;">
                ${ctaButton(primaryUrl, primaryLabel)}
              </div>`;
  }

  return `
              <div style="text-align:center; margin-top:36px; font-size:0;">
                <!--[if mso]><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top"><![endif]-->
                ${ctaButton(primaryUrl, primaryLabel, { padding: '16px 34px' })}
                <!--[if mso]></td><td valign="top"><![endif]-->
                ${ctaButton(secondary.url, secondary.label, { primary: false, padding: '14px 32px' })}
                <!--[if mso]></td></tr></table><![endif]-->
              </div>`;
};

/**
 * Los dos botones de los emails de propiedad: el detalle como acción principal y
 * el catálogo como secundaria.
 *
 * Si no llega el `id` cae al botón único de siempre apuntando al catálogo, que es
 * mejor que mandar a `/properties/undefined`. Se devuelve como tupla para
 * spreadearla en `wrapper(...)` y no repetir el ternario en cada template.
 */
const propertyCtas = (
  propertyId?: number,
): [string, string, { url: string; label: string }?] =>
  propertyId
    ? [
        `${BASE_URL}/properties/${propertyId}`,
        'Ver propiedad',
        { url: `${BASE_URL}/properties`, label: 'Ver catálogo' },
      ]
    : [`${BASE_URL}/properties`, 'Ver todas las propiedades'];

export const EmailTemplates = {

  // ── WRAPPER BASE ──────────────────────────────────────────────────────────
  /**
   * `secondaryCta` es opcional y agrega un segundo botón, con menos peso visual,
   * al lado del principal. Va como cuarto parámetro y no reemplazando
   * `ctaUrl`/`ctaLabel` por un array justamente para no tocar los siete
   * templates que ya llaman al wrapper con un solo botón.
   */
  wrapper: (
    content: string,
    ctaUrl?: string,
    ctaLabel?: string,
    secondaryCta?: { url: string; label: string },
  ) => `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0; padding:0; background-color:#f0f4f0; font-family:'Helvetica Neue', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f0; padding:40px 20px;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

            <!-- BANNER HEADER -->
            <tr>
              <!-- El background-color va ANTES del gradiente: Outlook ignora
                   linear-gradient y sin el color plano el banner queda blanco,
                   con el texto blanco encima volviéndose invisible. -->
              <td style="background-color:${BRAND_GREEN}; background-image:linear-gradient(135deg, #0b7a4b 0%, #0f8c58 100%); border-radius:16px 16px 0 0; padding:18px 40px; text-align:center;">
                <img src="${LOGO_URL}" alt="CercaTrova" style="height:44px; width:auto; display:inline-block; margin-bottom:8px; border-radius:8px;" />
                <p style="color:#ffffff; font-size:13px; margin:0; letter-spacing:2px; text-transform:uppercase; font-weight:600;">Inmobiliaria CercaTrova</p>
              </td>
            </tr>

            <!-- CONTENIDO -->
            <tr>
              <td style="background:#ffffff; padding:40px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
                ${content}

                ${ctaUrl && ctaLabel ? ctaGroup(ctaUrl, ctaLabel, secondaryCta) : ''}
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

  // ── HELPER: tira de miniaturas ────────────────────────────────────────────
  /**
   * El resto de las fotos, en una fila de 4 columnas iguales que ocupa
   * exactamente el ancho disponible.
   *
   * Antes era una tira `white-space:nowrap` con `overflow-x:auto` para poder
   * "deslizarla". El problema es que el scroll horizontal solo funciona en Apple
   * Mail y algún webmail: en Gmail, que es la mayoría del padrón, el `overflow`
   * se ignora y la fila más ancha que la tarjeta queda RECORTADA — la cuarta
   * miniatura aparecía cortada al medio, que es justo lo que hace que la galería
   * se vea pegada con calzador. Repartiendo el ancho en columnas iguales las
   * fotos entran siempre justas, sin recortes y sin depender de ninguna
   * propiedad dudosa. El `padding` va a los DOS lados de cada celda y no solo a
   * la derecha: si la última no lleva canaleta, su celda queda más ancha y esa
   * miniatura sale más grande que las otras tres.
   *
   * Se muestran hasta 4 y, si hay más, el label lo aclara en vez de esconderlas
   * sin avisar. Eso además le pone un techo al peso del email.
   *
   * El ARCHIVO que se pide es de 800×600, aunque en el layout se vea de apenas
   * ~130px de ancho (el `<td width="25%">` la reduce): el `<img>` solo cambia
   * cómo se MUESTRA la miniatura, no el peso real del archivo. Si se pidiera
   * recortada al tamaño de pantalla (como antes, 300×220), al usuario hacerle
   * click para verla grande — la mayoría de los clientes de email abren la
   * imagen en su tamaño real al tocarla — se encontraba con una foto pixelada.
   * 800×600 no es la resolución de la portada (1200×750) para no duplicar el
   * peso del email cuatro veces, pero alcanza para que se vea nítida ampliada.
   */
  thumbStrip: (urls: string[]) => {
    const thumbs = urls.slice(0, 4);
    if (thumbs.length === 0) return '';

    const sobrantes = urls.length - thumbs.length;

    return `
      <p style="color:#9ca3af; font-size:10px; margin:0 0 9px 0; font-weight:800; text-transform:uppercase; letter-spacing:1.2px;">
        Más fotos${sobrantes > 0 ? ` — y ${sobrantes} más en el sitio` : ''}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          ${thumbs.map((url, i) => `
            <td width="${Math.floor(100 / thumbs.length)}%" valign="top" style="padding:0 3px;">
              <img src="${cropped(url, 800, 600)}" alt="Foto ${i + 2} de la propiedad"
                style="width:100%; max-width:100%; height:auto; display:block; border-radius:7px; border:1px solid ${HAIRLINE};" />
            </td>`).join('')}
        </tr>
      </table>`;
  },

  // ── HELPER: galería completa (foto principal + tira) ──────────────────────
  /** Se usa donde la propiedad se muestra sin flyer, como en la baja de precio. */
  renderImages: (urls: string[]) => {
    if (urls.length === 0) return '';

    const [cover, ...rest] = urls;

    return `
      <div style="margin-top:20px;">
        <img src="${cropped(cover, 1200, 750)}" alt="Foto principal de la propiedad" width="600"
          style="width:100%; max-width:100%; height:auto; display:block; border-radius:10px; border:1px solid ${HAIRLINE};" />
        ${rest.length > 0 ? `<div style="margin-top:14px;">${EmailTemplates.thumbStrip(rest)}</div>` : ''}
      </div>`;
  },

  // ── HELPER: chips de "características que cumple" ─────────────────────────
  /**
   * Cada chip es una tabla de una sola celda con `display:inline-block`.
   *
   * Antes eran `<span>` dentro de un contenedor `display:flex; gap:6px`: el flex
   * y el gap los ignoran TODOS los clientes de email, así que la separación real
   * salía del `margin` de cada span y los chips quedaban apretados y
   * desalineados entre renglones. Con el padding en el `<td>` el alto del chip es
   * real incluso en Outlook, y el `margin` del wrapper da una separación
   * uniforme horizontal y vertical. Donde `inline-block` no se soporta (Outlook
   * viejo) cada chip pasa a ocupar su propio renglón: se ve distinto, pero
   * alineado y legible.
   */
  matchChips: (items: string[]) => {
    if (items.length === 0) return '';

    return `
      <div style="margin:0 0 24px 0;">
        ${items.map((c) => `
          <table cellpadding="0" cellspacing="0" border="0" style="display:inline-block; margin:0 6px 8px 0; vertical-align:top;">
            <tr>
              <td style="background-color:${BRAND_LIGHT}; border:1px solid ${BRAND_BORDER}; border-radius:16px; padding:7px 14px; color:${BRAND_GREEN}; font-size:12px; font-weight:700; font-family:'Helvetica Neue', Arial, sans-serif; white-space:nowrap;">
                ✓&nbsp;${escapeHtml(c)}
              </td>
            </tr>
          </table>`).join('')}
      </div>`;
  },

  // ── HELPER: flyer de propiedad ────────────────────────────────────────────
  /**
   * La propiedad como un flyer de inmobiliaria y no como una ficha de datos:
   * foto principal a sangre arriba, después título y precio con jerarquía
   * fuerte, la ficha técnica como una franja de íconos, la descripción, y las
   * miniaturas cerrando DENTRO de la misma tarjeta.
   *
   * Todo el armado es con `<table>` anidadas e `inline styles`: ni flex ni grid
   * existen en Outlook, y las hojas de estilo (incluso un `<style>` en el head)
   * las descarta Gmail. Las divisorias de la ficha técnica son `border` de
   * `<td>`, que sí es universal.
   *
   * Recibe un objeto y no una lista de parámetros porque ya son siete datos y
   * varios son strings seguidos: posicionales, invertir dos por error no daría
   * ningún error de tipos.
   */
  propertyFlyer: ({
    title,
    location,
    price,
    operationType,
    description = '',
    images = [],
    specs = [],
  }: {
    title: string;
    location: string;
    price: number;
    operationType: string;
    description?: string;
    images?: string[];
    specs?: { label: string; value: string | number }[];
  }) => {
    const [cover, ...rest] = images;

    // Ficha técnica de 3 columnas: 6 specs entran en 2 renglones parejos.
    const specRows: string[] = [];
    for (let i = 0; i < specs.length; i += 3) {
      const grupo = specs.slice(i, i + 3);
      const esUltimoRenglon = i + 3 >= specs.length;
      const vacias = (3 - grupo.length) % 3;

      specRows.push(`
        <tr>
          ${grupo.map((s, j) => `
            <td width="33%" align="center" valign="top" style="padding:14px 6px; ${
              j < grupo.length - 1 ? `border-right:1px solid ${HAIRLINE};` : ''
            }${esUltimoRenglon ? '' : `border-bottom:1px solid ${HAIRLINE};`}">
              <div style="font-size:20px; line-height:24px;">${SPEC_ICONS[s.label] ?? ''}</div>
              <div style="color:${INK}; font-size:16px; font-weight:700; line-height:20px; margin-top:4px;">${s.value}</div>
              <div style="color:#8a938c; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.7px; margin-top:3px;">${s.label}</div>
            </td>`).join('')}
          ${Array.from({ length: vacias }, () => '<td width="33%"></td>').join('')}
        </tr>`);
    }

    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background-color:#ffffff; border:1.5px solid ${BRAND_BORDER}; border-radius:14px; margin:0 0 8px 0;">

      ${cover ? `
      <!-- FOTO PRINCIPAL — a sangre, sin margen contra los bordes del flyer.
           El line-height:0 del td evita la franja blanca que algunos clientes
           agregan debajo de una imagen tratada como texto. -->
      <tr>
        <td style="padding:0; line-height:0; font-size:0;">
          <img src="${cropped(cover, 1200, 750)}" alt="${escapeHtml(title)}" width="600"
            style="width:100%; max-width:100%; height:auto; display:block; border-radius:13px 13px 0 0;" />
        </td>
      </tr>` : ''}

      <!-- OPERACIÓN + TÍTULO + UBICACIÓN -->
      <tr>
        <td style="padding:24px 26px 0 26px;">
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;">
            <tr>
              <td style="background-color:${BRAND_GREEN}; border-radius:14px; padding:5px 13px; color:#ffffff; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1.2px; font-family:'Helvetica Neue', Arial, sans-serif;">
                ${escapeHtml(operationType)}
              </td>
            </tr>
          </table>
          <h3 style="color:${INK}; font-size:25px; line-height:1.25; font-weight:800; margin:0 0 8px 0; letter-spacing:-0.4px;">
            ${escapeHtml(title)}
          </h3>
          <p style="color:${MUTED}; font-size:14px; margin:0; line-height:1.5;">📍 ${escapeHtml(location)}</p>
        </td>
      </tr>

      <!-- PRECIO — protagonista, en su propia franja verde clara -->
      <tr>
        <td style="padding:18px 26px 0 26px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND_LIGHT}; border-radius:10px;">
            <tr>
              <td style="padding:14px 18px;">
                <div style="color:${BRAND_GREEN}; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1.2px; opacity:0.75;">Precio</div>
                <div style="color:${BRAND_GREEN}; font-size:30px; font-weight:800; line-height:1.15; letter-spacing:-0.8px; margin-top:3px;">
                  USD ${price.toLocaleString('es-AR')}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      ${specRows.length > 0 ? `
      <!-- FICHA TÉCNICA -->
      <tr>
        <td style="padding:16px 26px 0 26px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7faf8; border:1px solid ${HAIRLINE}; border-radius:10px;">
            ${specRows.join('')}
          </table>
        </td>
      </tr>` : ''}

      ${description ? `
      <!-- DESCRIPCIÓN -->
      <tr>
        <td style="padding:20px 26px 0 26px;">
          <p style="color:#8a938c; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:1.2px; margin:0 0 7px 0;">Sobre la propiedad</p>
          <p style="color:#4b5563; font-size:14px; line-height:1.7; margin:0;">
            ${escapeHtml(truncate(description, DESCRIPTION_MAX)).replace(/\r?\n/g, '<br/>')}
          </p>
        </td>
      </tr>` : ''}

      ${rest.length > 0 ? `
      <!-- MINIATURAS — dentro del flyer, separadas por una divisoria -->
      <tr>
        <td style="padding:20px 26px 22px 26px;">
          <div style="border-top:1px solid ${HAIRLINE}; padding-top:18px;">
            ${EmailTemplates.thumbStrip(rest)}
          </div>
        </td>
      </tr>` : `
      <tr><td style="padding:0 26px 24px 26px; font-size:0; line-height:0;">&nbsp;</td></tr>`}

    </table>
  `;
  },

  // ── HELPER: aviso corto para el admin ─────────────────────────────────────
  /** Bloque simple usado por todos los emails internos del panel. */
  adminNotice: (title: string, message: string, emoji: string) => `
    <h2 style="color:#111827; font-size:21px; font-weight:700; margin:0 0 8px 0;">
      ${emoji} ${title}
    </h2>
    <p style="color:#4b5563; font-size:15px; margin:0; line-height:1.65;">
      ${message}
    </p>
    <div style="background:${BRAND_LIGHT}; border-radius:8px; padding:12px 16px; margin-top:20px;">
      <p style="color:${BRAND_GREEN}; font-size:13px; margin:0; font-weight:600;">
        Este es un aviso automático del panel de administración.
      </p>
    </div>
  `,

  // ── 1. NUEVA PROPIEDAD (GLOBAL) ───────────────────────────────────────────
  newProperty: (
    title: string, location: string, price: number, images: string[], operationType: string,
    specs: { label: string; value: string | number }[] = [],
    description = '',
    propertyId?: number,
  ) =>
    EmailTemplates.wrapper(
      `
      <h2 style="color:${INK}; font-size:22px; font-weight:700; margin:0 0 8px 0;">
        🏠 Nueva propiedad publicada
      </h2>
      <p style="color:${MUTED}; font-size:15px; margin:0 0 22px 0; line-height:1.6;">
        Se agregó una nueva propiedad a nuestro catálogo. ¡No te la pierdas!
      </p>
      ${EmailTemplates.propertyFlyer({ title, location, price, operationType, description, images, specs })}
      `,
      ...propertyCtas(propertyId),
    ),

  // ── 2. MATCH CON PREFERENCIAS ─────────────────────────────────────────────
  matchSearch: (
    userName: string, title: string, location: string, price: number,
    images: string[], matchedCharacteristics: string[],
    matchedCount: number, totalCount: number, operationType: string,
    specs: { label: string; value: string | number }[] = [],
    description = '',
    propertyId?: number,
  ) =>
    EmailTemplates.wrapper(
      `
      <h2 style="color:${INK}; font-size:22px; font-weight:700; margin:0 0 8px 0;">
        ✨ ¡Encontramos algo para vos, ${userName}!
      </h2>
      <p style="color:${MUTED}; font-size:15px; margin:0 0 18px 0; line-height:1.6;">
        Esta propiedad cumple <strong style="color:${BRAND_GREEN};">${matchedCount} de ${totalCount}</strong> características que buscás.
      </p>

      ${EmailTemplates.matchChips(matchedCharacteristics)}

      ${EmailTemplates.propertyFlyer({ title, location, price, operationType, description, images, specs })}
      `,
      ...propertyCtas(propertyId),
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

  // ── 6. NUEVA PUBLICACIÓN (feed) ───────────────────────────────────────────
  newPost: (description: string, imageUrl?: string) =>
    EmailTemplates.wrapper(
      `
      <h2 style="color:#111827; font-size:22px; font-weight:700; margin:0 0 8px 0;">
        📣 Nueva publicación
      </h2>
      <p style="color:#6b7280; font-size:15px; margin:0 0 18px 0; line-height:1.6;">
        Subimos algo nuevo al feed. Estas publicaciones duran solo 7 días.
      </p>
      ${imageUrl ? `
      <img src="${imageUrl}" alt="Publicación"
        style="width:100%; max-width:100%; height:auto; display:block; border-radius:10px; border:1px solid #e5e7eb;" />` : ''}
      <div style="background:#f8faf8; border:1px solid #e5e7eb; border-left:4px solid ${BRAND_GREEN}; border-radius:10px; padding:18px; margin-top:18px;">
        <p style="color:#374151; font-size:15px; line-height:1.65; margin:0;">${description}</p>
      </div>
      `,
      `${BASE_URL}/publicaciones`,
      'Ver la publicación',
    ),

  // ── 7. RESPONDIERON TU COMENTARIO ─────────────────────────────────────────
  commentReply: (userName: string, responderName: string, preview: string) =>
    EmailTemplates.wrapper(
      `
      <h2 style="color:#111827; font-size:22px; font-weight:700; margin:0 0 8px 0;">
        💬 Respondieron tu comentario
      </h2>
      <p style="color:#6b7280; font-size:15px; margin:0 0 18px 0; line-height:1.6;">
        Hola ${userName}, <strong style="color:${BRAND_GREEN};">${responderName}</strong> respondió a un comentario tuyo en Publicaciones.
      </p>
      <div style="background:${BRAND_LIGHT}; border-left:4px solid ${BRAND_GREEN}; border-radius:10px; padding:18px;">
        <p style="color:#374151; font-size:15px; line-height:1.65; margin:0; font-style:italic;">“${preview}”</p>
      </div>
      `,
      `${BASE_URL}/publicaciones`,
      'Ver la conversación',
    ),

  // ── 8. AVISO INTERNO PARA EL ADMIN ────────────────────────────────────────
  /**
   * Un solo template para los cinco avisos del panel (nuevo usuario, comentario,
   * valoración, solicitud y favorito): el texto ya lo arma
   * `NotificationService`, así que acá solo se le da forma.
   */
  adminAlert: (title: string, message: string, emoji: string, ctaPath = '/dashboardAdmin/notificaciones') =>
    EmailTemplates.wrapper(
      EmailTemplates.adminNotice(title, message, emoji),
      `${BASE_URL}${ctaPath}`,
      'Abrir el panel',
    ),
};