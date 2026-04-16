const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 1000;
const DEFAULT_SOURCE_FILE = path.resolve(__dirname, '../../../data/raw_pemilu_full_dump.csv');

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function parseDateTime(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(String(value).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNik(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.replace(/\s+/g, '') : null;
}

function toBoolean(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
}

function normalizeCsvRow(rawRow) {
  const normalizedRow = {};

  for (const key of Object.keys(rawRow)) {
    normalizedRow[String(key).trim().toLowerCase()] = rawRow[key];
  }

  return normalizedRow;
}

function mapRowToEntities(rawRow) {
  const row = normalizeCsvRow(rawRow);
  const nik = normalizeNik(row.nik);

  if (!nik) {
    return null;
  }

  const nama = normalizeString(row.nama);
  const tanggalLahir = parseDateOnly(row.tanggal_lahir);
  const alamat = [
    normalizeString(row.kelurahan_raw),
    normalizeString(row.kecamatan_raw),
    normalizeString(row.kabupaten_raw),
    normalizeString(row.provinsi_raw),
  ]
    .filter(Boolean)
    .join(', ') || null;

  const wilayah = [
    normalizeString(row.provinsi_raw),
    normalizeString(row.kabupaten_raw),
    normalizeString(row.kecamatan_raw),
    normalizeString(row.kelurahan_raw),
  ]
    .filter(Boolean)
    .join(' > ') || null;

  const dukcapil = {
    nik,
    nama,
    tanggal_lahir: tanggalLahir,
    alamat,
  };

  const dpt = {
    nik,
    nama,
    tps_id: normalizeString(row.tps_id),
    wilayah,
  };

  const hadir = toBoolean(row.hadir);
  const invalidFlag = toBoolean(row.invalid_flag);
  const votedAt = parseDateTime(row.waktu_mencoblos) || parseDateTime(row.created_at);

  const voting = hadir && !invalidFlag && votedAt
    ? {
        nik,
        voted_at: votedAt,
      }
    : null;

  return {
    dukcapil,
    dpt,
    voting,
  };
}

function buildValuesAndReplacements(records, columns, prefix) {
  const replacements = {};

  const valuesSql = records
    .map((record, recordIndex) => {
      const placeholders = columns.map((columnName) => {
        const replacementKey = `${prefix}_${columnName}_${recordIndex}`;
        replacements[replacementKey] = record[columnName] ?? null;
        return `:${replacementKey}`;
      });

      return `(${placeholders.join(', ')})`;
    })
    .join(', ');

  return {
    valuesSql,
    replacements,
  };
}

async function upsertByNik(sequelize, tableName, records, columns, updateColumns, prefix) {
  if (records.length === 0) {
    return 0;
  }

  const dedupedByNik = Array.from(new Map(records.map((record) => [record.nik, record])).values());

  const { valuesSql, replacements } = buildValuesAndReplacements(dedupedByNik, columns, prefix);
  const updateSql = updateColumns.map((columnName) => `${columnName} = EXCLUDED.${columnName}`).join(', ');

  const sql = `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES ${valuesSql}
    ON CONFLICT (nik) DO UPDATE
    SET ${updateSql}
    RETURNING nik;
  `;

  const result = await sequelize.query(sql, { replacements });
  return Array.isArray(result?.[0]) ? result[0].length : 0;
}

async function insertVotingIfNotExists(sequelize, records) {
  if (records.length === 0) {
    return 0;
  }

  const dedupedByNik = Array.from(new Map(records.map((record) => [record.nik, record])).values());
  const { valuesSql, replacements } = buildValuesAndReplacements(
    dedupedByNik,
    ['nik', 'voted_at'],
    'voting'
  );

  const sql = `
    INSERT INTO voting (nik, voted_at)
    VALUES ${valuesSql}
    RETURNING nik;
  `;

  const result = await sequelize.query(sql, { replacements });
  return Array.isArray(result?.[0]) ? result[0].length : 0;
}

async function flushBatch(sequelize, batch, summary) {
  const insertedDukcapil = await upsertByNik(
    sequelize,
    'dukcapil',
    batch.dukcapil,
    ['nik', 'nama', 'tanggal_lahir', 'alamat'],
    ['nama', 'tanggal_lahir', 'alamat'],
    'dukcapil'
  );
  const insertedDpt = await upsertByNik(
    sequelize,
    'dpt',
    batch.dpt,
    ['nik', 'nama', 'tps_id', 'wilayah'],
    ['nama', 'tps_id', 'wilayah'],
    'dpt'
  );
  const insertedVoting = await insertVotingIfNotExists(sequelize, batch.voting);

  summary.insertedDukcapil += insertedDukcapil;
  summary.insertedDpt += insertedDpt;
  summary.insertedVoting += insertedVoting;

  batch.dukcapil.length = 0;
  batch.dpt.length = 0;
  batch.voting.length = 0;
}

async function importVotersFromCsv({ sequelize, EtlImportRun, filePath, batchSize = DEFAULT_BATCH_SIZE }) {
  if (!EtlImportRun) {
    throw new Error('EtlImportRun model is required for import tracking.');
  }

  const sourceFile = path.resolve(filePath || DEFAULT_SOURCE_FILE);
  const parsedBatchSize = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE;
  const normalizedBatchSize = Math.min(parsedBatchSize, MAX_BATCH_SIZE);

  if (!fs.existsSync(sourceFile)) {
    throw new Error(`CSV file not found at ${sourceFile}`);
  }

  const importRun = await EtlImportRun.create({
    source_file: sourceFile,
    status: 'running',
    started_at: new Date(),
  });

  const summary = {
    importRunId: importRun.id,
    sourceFile,
    batchSize: normalizedBatchSize,
    totalRows: 0,
    insertedDukcapil: 0,
    insertedDpt: 0,
    insertedVoting: 0,
    skippedRows: 0,
    errorRows: 0,
  };

  const batch = {
    dukcapil: [],
    dpt: [],
    voting: [],
  };

  try {
    const stream = fs.createReadStream(sourceFile).pipe(csvParser());

    for await (const row of stream) {
      summary.totalRows += 1;

      const mapped = mapRowToEntities(row);

      if (!mapped) {
        summary.skippedRows += 1;
        continue;
      }

      batch.dukcapil.push(mapped.dukcapil);
      batch.dpt.push(mapped.dpt);

      if (mapped.voting) {
        batch.voting.push(mapped.voting);
      }

      if (batch.dukcapil.length >= normalizedBatchSize) {
        await flushBatch(sequelize, batch, summary);
      }
    }

    await flushBatch(sequelize, batch, summary);

    await importRun.update({
      status: 'success',
      finished_at: new Date(),
      total_rows: summary.totalRows,
      inserted_dukcapil: summary.insertedDukcapil,
      inserted_dpt: summary.insertedDpt,
      inserted_voting: summary.insertedVoting,
      skipped_rows: summary.skippedRows,
      error_rows: summary.errorRows,
    });

    return {
      ...summary,
      status: 'success',
    };
  } catch (error) {
    await importRun.update({
      status: 'failed',
      finished_at: new Date(),
      total_rows: summary.totalRows,
      inserted_dukcapil: summary.insertedDukcapil,
      inserted_dpt: summary.insertedDpt,
      inserted_voting: summary.insertedVoting,
      skipped_rows: summary.skippedRows,
      error_rows: summary.errorRows + 1,
      error_message: error.message,
    });

    throw error;
  }
}

module.exports = {
  importVotersFromCsv,
};
