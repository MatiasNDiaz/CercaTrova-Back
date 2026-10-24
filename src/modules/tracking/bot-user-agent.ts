/**
 * ¿La visita la hizo un bot / crawler / herramienta automática?
 *
 * Las visitas las registra el NAVEGADOR (`VisitTracker` en el front), así que
 * los bots que no ejecutan JavaScript ya no llegan. Pero los que sí lo
 * ejecutan —Googlebot y Bingbot renderizan la página, igual que Lighthouse,
 * los monitores de disponibilidad o un Chrome "headless"— sumaban como
 * personas en las estadísticas. Esas visitas ya no se guardan.
 *
 * Sin user-agent también cuenta como bot: todo navegador real lo manda.
 */
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|mediapartners|facebookexternalhit|facebookcatalog|whatsapp|telegram|discord|preview|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|site24x7|curl\/|wget\/|python-requests|python-urllib|aiohttp|axios\/|node-fetch|undici|go-http-client|okhttp|java\/|apache-httpclient|libwww|scrapy|phantomjs|selenium|puppeteer|playwright/i;

export function isBotUserAgent(userAgent: string | undefined | null): boolean {
  const ua = userAgent?.trim();
  if (!ua) return true;
  return BOT_UA.test(ua);
}
