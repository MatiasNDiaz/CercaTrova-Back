// Tarjeta de visitantes (Parte 3): períodos, cálculos y filtro de bots.
import { StatsRange } from './dto/statistics-query.dto';
import {
  pagesPerVisitor,
  percentChange,
  realVisitsParams,
  startOfTodayAR,
  visitorPeriods,
} from './visitors';
import { isBotUserAgent } from '../tracking/bot-user-agent';

const H = 60 * 60 * 1000;

describe('visitorPeriods', () => {
  // 24/10/2026 15:30 en Argentina = 18:30 UTC.
  const now = new Date('2026-10-24T18:30:00Z');

  it('Día = HOY desde las 00:00 de Argentina (03:00 UTC), contra ayer al mismo tramo', () => {
    const p = visitorPeriods(StatsRange.DAY, now);
    expect(p.label).toBe('Hoy');
    expect(p.current.from.toISOString()).toBe('2026-10-24T03:00:00.000Z');
    expect(p.current.to).toEqual(now);
    expect(p.previous.from.toISOString()).toBe('2026-10-23T03:00:00.000Z');
    expect(p.previous.to.toISOString()).toBe('2026-10-23T18:30:00.000Z');
    expect(p.previousLabel).toBe('ayer a esta hora');
  });

  it('a las 01:00 UTC todavía es "ayer" en Argentina', () => {
    expect(startOfTodayAR(new Date('2026-10-25T01:00:00Z')).toISOString()).toBe(
      '2026-10-24T03:00:00.000Z',
    );
  });

  it('Semana = últimos 7 días contra los 7 anteriores', () => {
    const p = visitorPeriods(StatsRange.WEEK, now);
    expect(p.label).toBe('Últimos 7 días');
    expect(now.getTime() - p.current.from.getTime()).toBe(7 * 24 * H);
    expect(p.previous.to).toEqual(p.current.from);
    expect(p.previous.to.getTime() - p.previous.from.getTime()).toBe(
      7 * 24 * H,
    );
  });

  it('Mes = últimos 30 días contra los 30 anteriores', () => {
    const p = visitorPeriods(StatsRange.MONTH, now);
    expect(p.label).toBe('Últimos 30 días');
    expect(p.previousLabel).toBe('los 30 días anteriores');
    expect(now.getTime() - p.current.from.getTime()).toBe(30 * 24 * H);
  });

  it('la consulta mira 30 min antes del inicio para detectar recargas en el borde', () => {
    const p = visitorPeriods(StatsRange.WEEK, now);
    const [lookback, from, to] = realVisitsParams(p.current);
    expect(from.getTime() - lookback.getTime()).toBe(30 * 60 * 1000);
    expect(from).toEqual(p.current.from);
    expect(to).toEqual(now);
  });
});

describe('pagesPerVisitor / percentChange', () => {
  it('1.287 páginas de 414 personas ≈ 3,1', () => {
    expect(pagesPerVisitor(1287, 414)).toBe(3.1);
  });
  it('sin visitantes no divide por cero', () => {
    expect(pagesPerVisitor(0, 0)).toBeNull();
  });
  it('variación respecto del período anterior', () => {
    expect(percentChange(112, 100)).toBe(12);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(5, 0)).toBeNull();
  });
});

describe('isBotUserAgent', () => {
  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0 Mobile Safari/537.36 Chrome-Lighthouse',
    'facebookexternalhit/1.1',
    'WhatsApp/2.23.20.0',
    'UptimeRobot/2.0',
    'curl/8.4.0',
    'python-requests/2.31.0',
    '',
    undefined,
  ])('bot: %s', (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0',
  ])('persona: %s', (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });
});
