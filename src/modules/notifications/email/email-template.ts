export const EmailTemplates = {

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
        ${content}
      </div>

      <p style="text-align:center; color:#888; margin-top:15px; font-size:12px;">
        © CercaTrova Inmobiliaria — Mensaje automático
      </p>
    </div>
  `,

  newProperty: (title: string, zone: string, price: number, images: string[]) =>
    EmailTemplates.wrapper(`
      <h2 style="color:#333; margin-bottom:5px;">Nueva propiedad publicada</h2>
      <p style="color:#555; font-size:15px;">Se agregó una nueva propiedad: ${title}</p>
      <div style="margin:20px 0;">
        <p style="font-size:16px; color:#333; margin:4px 0;"><strong>${title}</strong></p>
        <p style="color:#555;">Zona: <strong>${zone}</strong></p>
        <p style="color:#555;">Precio: <strong>$${price}</strong></p>
      </div>
      ${EmailTemplates.renderImages(images)}
    `),

  matchSearch: (
    userName: string,
    title: string,
    zone: string,
    price: number,
    images: string[],
    matchedCharacteristics: string[]
  ) =>
    EmailTemplates.wrapper(`
      <h2 style="color:#333;">¡Tenemos una propiedad ideal para vos, ${userName}!</h2>
      <p style="color:#555; font-size:15px;">
        La propiedad coincide con las siguientes características:
      </p>
      <ul>
        ${matchedCharacteristics.map(c => `<li>${c}</li>`).join('')}
      </ul>
      <div style="margin:20px 0;">
        <p style="font-size:16px; color:#333; margin:4px 0;"><strong>${title}</strong></p>
        <p style="color:#555;">Zona: <strong>${zone}</strong></p>
        <p style="color:#555;">Precio: <strong>$${price}</strong></p>
      </div>
      ${EmailTemplates.renderImages(images)}
    `),

  priceDrop: (
    title: string,
    zone: string,
    oldPrice: number,
    newPrice: number,
    images: string[]
  ) =>
    EmailTemplates.wrapper(`
      <h2 style="color:#d9534f;">¡Una propiedad bajó de precio!</h2>
      <p style="color:#555;">La siguiente propiedad redujo su precio:</p>
      <div style="margin:20px 0;">
        <p style="font-size:16px; color:#333;"><strong>${title}</strong></p>
        <p style="color:#555;">Zona: <strong>${zone}</strong></p>
        <p style="color:#555;">Antes: <strong style="text-decoration:line-through;">$${oldPrice}</strong></p>
        <p style="color:#28a745;">Ahora: <strong>$${newPrice}</strong></p>
      </div>
      ${EmailTemplates.renderImages(images)}
    `),

  globalMessage: (content: string) =>
    EmailTemplates.wrapper(`
      <h2 style="color:#333;">Mensaje del agente</h2>
      <p style="color:#555; font-size:15px;">${content}</p>
    `),

  renderImages: (urls: string[]) =>
    urls.length === 0
      ? ''
      : `
        <div style="margin-top:20px;">
          ${urls
            .map(
              url => `
              <img src="${url}" alt="Imagen de propiedad"
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
      `,
};
