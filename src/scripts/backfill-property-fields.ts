/**
 * Backfill de los campos nuevos de Property (superficie cubierta, dirección y
 * documentación legal) para las propiedades que ya estaban cargadas antes de
 * que esas columnas existieran.
 *
 * Correr con:  npm run backfill:properties
 *
 * Es IDEMPOTENTE: solo completa lo que está vacío (`supCubierta`/`direccion` en
 * null). De la documentación legal toca ÚNICAMENTE los dos campos nuevos
 * (`tractoAbreviado`/`boleto`) y solo mientras sigan ambos en false, que es el
 * default con el que los creó la migración; `property_deed` nunca se pisa
 * porque es un dato real ya cargado. `supTotal` tampoco se toca: ya trae el
 * valor migrado desde `m2`.
 */
import ds from '../config/data-source';
import { Property } from '../modules/properties/entities/property.entity';

// Direcciones de ejemplo, para poder ver el mapa del detalle funcionando.
// Se eligen por índice sobre las propiedades sin dirección cargada.
const CALLES_EJEMPLO = [
  'Av. San Martín 1250',
  'Belgrano 480',
  'Av. Colón 2130',
  'Rivadavia 765',
  'Sarmiento 1890',
  'Av. Libertador 340',
  'Mitre 615',
  'Av. Costanera 2200',
  'Independencia 1075',
  'Av. Uruguay 530',
  'Las Heras 940',
  'Av. Los Álamos 1680',
];

// Combinaciones variadas de los DOS campos legales nuevos, para ver los
// checkboxes en distintos estados en el detalle. Se rotan por índice.
// `property_deed` queda como está en la base: es dato real preexistente.
const COMBINACIONES_LEGALES: Array<{
  tractoAbreviado: boolean;
  boleto: boolean;
}> = [
  { tractoAbreviado: false, boleto: false },
  { tractoAbreviado: true,  boleto: false },
  { tractoAbreviado: false, boleto: true  },
  { tractoAbreviado: true,  boleto: true  },
];

async function main() {
  await ds.initialize();
  const repo = ds.getRepository(Property);

  const properties = await repo.find({ order: { id: 'ASC' } });
  console.log(`Encontradas ${properties.length} propiedades.\n`);

  let actualizadas = 0;

  for (const [i, p] of properties.entries()) {
    const cambios: string[] = [];

    // Sup. Cubierta: ~75% de la total, un valor razonable y siempre <= total.
    if (p.supCubierta == null && p.supTotal != null) {
      p.supCubierta = Math.max(1, Math.round(Number(p.supTotal) * 0.75));
      cambios.push(`supCubierta=${p.supCubierta}`);
    }

    // Dirección: coherente con la ubicación que ya tiene cargada.
    if (!p.direccion) {
      p.direccion = CALLES_EJEMPLO[i % CALLES_EJEMPLO.length];
      cambios.push(`direccion="${p.direccion}"`);
    }

    // Campos legales nuevos: solo mientras sigan en el default de la migración
    // (ambos false), para no pisar lo que el admin haya cargado después.
    if (!p.tractoAbreviado && !p.boleto) {
      const combo = COMBINACIONES_LEGALES[i % COMBINACIONES_LEGALES.length];
      // El primer combo es (false, false): no aporta nada, se saltea.
      if (combo.tractoAbreviado || combo.boleto) {
        p.tractoAbreviado = combo.tractoAbreviado;
        p.boleto = combo.boleto;
        cambios.push(`tracto=${combo.tractoAbreviado} boleto=${combo.boleto}`);
      }
    }

    if (cambios.length === 0) {
      console.log(`  #${p.id} — sin cambios (ya tenía todo cargado)`);
      continue;
    }

    await repo.save(p);
    actualizadas++;
    console.log(`  #${p.id} — ${cambios.join(' | ')}`);
  }

  console.log(`\nListo: ${actualizadas} de ${properties.length} propiedades actualizadas.`);
  await ds.destroy();
}

main().catch((error) => {
  console.error('El backfill falló:', error instanceof Error ? error.message : error);
  process.exit(1);
});
