// src/modules/notifications/email/email-template.ts

const LOGO_URL = 'https://res.cloudinary.com/dmvybzxnv/image/upload/v1768176230/properties/ctflc5qkaoitg2aas6ht.jpg';
const BRAND_GREEN = '#0b7a4b';

export const EmailTemplates = {
  // -----------------------------------------------------
  // WRAPPER GENERAL (Logo corregido para no verse gigante)
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
        <div style="text-align:center; padding: 10px 0 20px 0;">
          <img
            src="${LOGO_URL}"
            alt="CercaTrova Inmobiliaria"
            style="width:200px; height:auto; display:inline-block; border:none;"
          />
        </div>

        ${content}

        <div style="margin-top:30px; text-align:center; border-top: 1px solid #eee; padding-top: 20px;">
          <p style="color:#555; margin-bottom:10px; font-size:14px;">Seguinos y contactanos</p>
          <a href="https://www.instagram.com/inmobiliariacercatrova/" target="_blank" style="margin-right:15px; text-decoration:none; color:${BRAND_GREEN}; font-weight:bold;">📷 Instagram</a>
          <a href="https://wa.me/5493515067576" target="_blank" style="text-decoration:none; color:${BRAND_GREEN}; font-weight:bold;">💬 WhatsApp</a>
        </div>
      </div>
      <p style="text-align:center; color:#888; margin-top:15px; font-size:12px;">© CercaTrova Inmobiliaria — Mensaje automático</p>
    </div>
  `,

  // -----------------------------------------------------
  // NUEVA PROPIEDAD (GLOBAL)
  // -----------------------------------------------------
  newProperty: (title: string, location: string, price: number, images: string[], operationType: string) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN}; margin-bottom:5px;">Nueva propiedad publicada</h2>
      <div style="display:inline-block; background:${BRAND_GREEN}; color:white; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:15px;">
        ${operationType}
      </div>

      <p style="color:#555; font-size:15px;">Se agregó una nueva propiedad a nuestro catálogo:</p>

      <div style="margin:20px 0; padding:15px; background:#f8f9fa; border-radius:8px; border-left: 4px solid ${BRAND_GREEN};">
        <p style="font-size:16px; margin:4px 0;"><strong style="color:${BRAND_GREEN};">${title}</strong></p>
        <p style="color:#555; margin:4px 0;">Ubicación: <strong>${location}</strong></p>
        <p style="color:#555; margin:4px 0;">Precio: <strong style="color:${BRAND_GREEN};">$${price}</strong></p>
      </div>

      ${EmailTemplates.renderImages(images)}
    `),

  // -----------------------------------------------------
  // MATCH CON PREFERENCIAS
  // -----------------------------------------------------
  matchSearch: (
    userName: string,
    title: string,
    location: string,
    price: number,
    images: string[],
    matchedCharacteristics: string[],
    matchedCount: number,
    totalCount: number,
    operationType: string
  ) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN}; font-size:18px; font-weight:bold;">¡Tenemos una propiedad para vos, ${userName}!</h2>
      
      <div style="display:inline-block; background:${BRAND_GREEN}; color:white; padding:4px 10px; border-radius:4px; font-size:12px; font-weight:bold; text-transform:uppercase; margin: 10px 0;">
        ${operationType}
      </div>

      <p style="font-size:16px; font-weight:bold; color:#222; margin-top:10px;">
        Esta propiedad cumple ${matchedCount} de las ${totalCount} características que buscás.
      </p>

      <ul style="padding-left:18px; color:#333; font-size:14px;">
        ${matchedCharacteristics.map(c => `<li style="display:inline-block; background:${BRAND_GREEN}; color:white; padding:2px 5px; border-radius:4px; font-size:12px; font-weight:semi-bold; text-transform:uppercase; margin-bottom:5px;;">✅ ${c}</li>`).join('')}
      </ul>

      <div style="margin:20px 0; padding:15px; background:#f8f9fa; border-radius:8px;">
        <p style="font-size:16px; margin:4px 0;"><strong style="color:${BRAND_GREEN};">${title}</strong></p>
        <p style="color:#555; margin:4px 0;">Ubicación: <strong>${location}</strong></p>
        <p style="color:#555; margin:4px 0;">Precio: <strong>$${price}</strong></p>
      </div>

      ${EmailTemplates.renderImages(images)}
    `),

  // -----------------------------------------------------
  // BAJA DE PRECIO
  // -----------------------------------------------------
  priceDrop: (title: string, zone: string, oldPrice: number, newPrice: number, images: string[]) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN};">¡Una propiedad bajó de precio!</h2>
      <p style="color:#555;">La siguiente propiedad redujo su valor:</p>
      <div style="margin:20px 0; padding:15px; background:#f8f9fa; border-radius:8px;">
        <p><strong>${title}</strong></p>
        <p>Zona: <strong>${zone}</strong></p>
        <p>Antes: <span style="text-decoration:line-through;">$${oldPrice}</span></p>
        <p style="color:#28a745; font-size:18px;">Ahora: <strong>$${newPrice}</strong></p>
      </div>
      ${EmailTemplates.renderImages(images)}
    `),

  // -----------------------------------------------------
  // MENSAJE GLOBAL
  // -----------------------------------------------------
  globalMessage: (content: string) =>
    EmailTemplates.wrapper(`
      <h2 style="color:${BRAND_GREEN};">Mensaje de CercaTrova</h2>
      <p style="color:#555; font-size:15px; line-height:1.5;">${content}</p>
    `),

  // -----------------------------------------------------
  // RENDER DE IMÁGENES (Optimizado)
  // -----------------------------------------------------
  renderImages: (urls: string[]) =>
    urls.length === 0 ? '' : `
      <div style="margin-top:20px;">
        <img src="${urls[0]}" alt="Imagen propiedad" style="width:100%; border-radius:10px; display:block;" />
      </div>`
};