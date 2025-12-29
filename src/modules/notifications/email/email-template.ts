const LOGO_URL =
  'https://res.cloudinary.com/dmvybzxnv/image/upload/v1765756207/properties/rtgooke0mob70fklrf9y.png';

// Verde del logo (email-safe)
const BRAND_GREEN = '#0b7a4b';

export const EmailTemplates = {
  // -----------------------------------------------------
  // WRAPPER GENERAL
  // -----------------------------------------------------
  wrapper: (content: string) => `
    <div style="width:100%; background:#f1f1f1; padding:30px 0; font-family:Arial, sans-serif;">
      <div style="
        max-width:600px;
        margin:0 auto;
        background:#ffffff;
        border-radius:12px;
        padding:25px;
        box-shadow:0 4px 12px rgba(0,0,0,0.08);
      ">

     <div style="
  text-align:center;
  margin:1px 0;
  width:240px;
  height:200px;
  overflow:hidden;
  margin-left:auto;
  margin-right:auto;
">
  <img
    src="${LOGO_URL}"
    alt="CercaTrova Inmobiliaria"
    style="
      width:106%;
      height:auto;
      display:block;
      margin:0 auto;
      transform:translateX(-1%);
    "
  />
</div>


        ${content}

        <!-- REDES -->
        <div style="margin-top:30px; text-align:center;">
          <p style="color:#555; margin-bottom:10px;">
            Seguinos y contactanos
          </p>

          <a
            href="https://www.instagram.com/inmobiliariacercatrova/"
            target="_blank"
            style="
              margin-right:15px;
              text-decoration:none;
              color:${BRAND_GREEN};
              font-weight:bold;
            "
          >
            📷 Instagram
          </a>

          <a
            href="https://wa.me/5493515067576"
            target="_blank"
            style="
              text-decoration:none;
              color:${BRAND_GREEN};
              font-weight:bold;
            "
          >
            💬 WhatsApp
          </a>
        </div>
      </div>

      <p style="text-align:center; color:#888; margin-top:15px; font-size:12px;">
        © CercaTrova Inmobiliaria — Mensaje automático
      </p>
    </div>
  `,

  // -----------------------------------------------------
  // NUEVA PROPIEDAD (GLOBAL)
  // -----------------------------------------------------
  newProperty: (title: string, zone: string, price: number, images: string[]) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN};">
        Nueva propiedad publicada
      </h2>

      <p style="color:#555; font-size:15px;">
        Se agregó una nueva propiedad a nuestro catálogo:
      </p>

      <div style="
        margin:20px 0;
        padding:15px;
        background:#f8f9fa;
        border-radius:8px;
      ">
        <p style="font-size:16px; margin:4px 0;">
          <strong style="color:${BRAND_GREEN};">${title}</strong>
        </p>
        <p style="color:#555;">
          Zona: <strong style="color:${BRAND_GREEN};">${zone}</strong>
        </p>
        <p style="color:#555;">
          Precio: <strong style="color:${BRAND_GREEN};">$${price}</strong>
        </p>
      </div>

      ${EmailTemplates.renderImages(images)}
    `),

  // -----------------------------------------------------
  // MATCH CON PREFERENCIAS
  // -----------------------------------------------------
  matchSearch: (
    userName: string,
    title: string,
    zone: string,
    price: number,
    images: string[],
    matchedCharacteristics: string[],
    matchedCount: number,
    totalCount: number
  ) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN}; font-size:18px; font-weight:bold;">
        ¡Tenemos una propiedad que puede interesarte, ${userName}!
      </h2>

      <p style="
        font-size:16px;
        font-weight:bold;
        color:#222;
        margin-top:10px;
      ">
        Esta propiedad cumple ${matchedCount} de las ${totalCount}
        características que buscás
      </p>

      <p style="color:#555; font-size:14px;">
        Coincide en los siguientes puntos:
      </p>

      <ul style="padding-left:18px; color:#333;">
        ${matchedCharacteristics.map(c => `<li>${c}</li>`).join('')}
      </ul>

      <div style="
        margin:20px 0;
        padding:15px;
        background:#f8f9fa;
        border-radius:8px;
      ">
        <p style="font-size:16px; margin:4px 0;">
          <strong style="color:${BRAND_GREEN};">${title}</strong>
        </p>
        <p style="color:#555;">
          Zona: <strong>${zone}</strong>
        </p>
        <p style="color:#555;">
          Precio: <strong>$${price}</strong>
        </p>
      </div>

      ${EmailTemplates.renderImages(images)}
    `),

  // -----------------------------------------------------
  // BAJA DE PRECIO
  // -----------------------------------------------------
  priceDrop: (
    title: string,
    zone: string,
    oldPrice: number,
    newPrice: number,
    images: string[]
  ) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN};">
        ¡Una propiedad bajó de precio!
      </h2>

      <p style="color:#555;">
        La siguiente propiedad redujo su valor:
      </p>

      <div style="
        margin:20px 0;
        padding:15px;
        background:#f8f9fa;
        border-radius:8px;
      ">
        <p><strong>${title}</strong></p>
        <p>Zona: <strong>${zone}</strong></p>
        <p>
          Antes:
          <strong style="text-decoration:line-through;">$${oldPrice}</strong>
        </p>
        <p style="color:#28a745;">
          Ahora: <strong>$${newPrice}</strong>
        </p>
      </div>

      ${EmailTemplates.renderImages(images)}
    `),

  // -----------------------------------------------------
  // MENSAJE GLOBAL
  // -----------------------------------------------------
  globalMessage: (content: string) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN};">Mensaje del agente</h2>
      <p style="color:#555; font-size:15px;">${content}</p>
    `),

  // -----------------------------------------------------
  // RENDER DE IMÁGENES
  // -----------------------------------------------------
  renderImages: (urls: string[]) =>
    urls.length === 0
      ? ''
      : `
        <div style="margin-top:20px;">
          ${urls
            .map(
              url => `
                <img
                  src="${url}"
                  alt="Imagen de propiedad"
                  style="
                    width:100%;
                    border-radius:10px;
                    margin:10px 0;
                    display:block;
                  "
                />
              `
            )
            .join('')}
        </div>
      `
};
