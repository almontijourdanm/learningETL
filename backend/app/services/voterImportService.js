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
    return {
      shouldSkip: true,
      reason: 'missing_nik',
    };
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
    shouldSkip: false,
    dukcapil,
    dpt,
    voting,
    quality: {
      hadirFalseRows: hadir ? 0 : 1,
      invalidFlagTrueRows: invalidFlag ? 1 : 0,
      invalidVotedAtRows: hadir && !invalidFlag && !votedAt ? 1 : 0,
      votingEligibleRows: voting ? 1 : 0,
      votingIneligibleRows: voting ? 0 : 1,
    },
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
    return {
      inserted: 0,
      updated: 0,
      affected: 0,
    };
  }

  const dedupedByNik = Array.from(new Map(records.map((record) => [record.nik, record])).values());

  const { valuesSql, replacements } = buildValuesAndReplacements(dedupedByNik, columns, prefix);
  const updateSql = updateColumns.map((columnName) => `${columnName} = EXCLUDED.${columnName}`).join(', ');

  const sql = `
    INSERT INTO ${tableName} (${columns.join(', ')})
    VALUES ${valuesSql}
    ON CONFLICT (nik) DO UPDATE
    SET ${updateSql}
    RETURNING ((xmax = 0)::int) AS inserted_flag;
  `;

  const result = await sequelize.query(sql, { replacements });
  const rows = Array.isArray(result?.[0]) ? result[0] : [];
  const inserted = rows.reduce((count, row) => count + (Number(row.inserted_flag) === 1 ? 1 : 0), 0);
  const affected = rows.length;

  return {
    inserted,
    updated: affected - inserted,
    affected,
  };
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
    ON CONFLICT (nik) DO NOTHING
    RETURNING nik;
  `;

  const result = await sequelize.query(sql, { replacements });
  return Array.isArray(result?.[0]) ? result[0].length : 0;
}

async function flushBatch(sequelize, batch, summary) {
  const dukcapilStats = await upsertByNik(
    sequelize,
    'dukcapil',
    batch.dukcapil,
    ['nik', 'nama', 'tanggal_lahir', 'alamat'],
    ['nama', 'tanggal_lahir', 'alamat'],
    'dukcapil'
  );
  const dptStats = await upsertByNik(
    sequelize,
    'dpt',
    batch.dpt,
    ['nik', 'nama', 'tps_id', 'wilayah'],
    ['nama', 'tps_id', 'wilayah'],
    'dpt'
  );
  const insertedVoting = await insertVotingIfNotExists(sequelize, batch.voting);

  summary.insertedDukcapil += dukcapilStats.inserted;
  summary.updatedDukcapil += dukcapilStats.updated;
  summary.affectedDukcapil += dukcapilStats.affected;
  summary.insertedDpt += dptStats.inserted;
  summary.updatedDpt += dptStats.updated;
  summary.affectedDpt += dptStats.affected;
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
    updatedDukcapil: 0,
    affectedDukcapil: 0,
    insertedDpt: 0,
    updatedDpt: 0,
    affectedDpt: 0,
    insertedVoting: 0,
    skippedRows: 0,
    rowsWithoutNik: 0,
    hadirFalseRows: 0,
    invalidFlagTrueRows: 0,
    invalidVotedAtRows: 0,
    votingEligibleRows: 0,
    votingIneligibleRows: 0,
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

      if (mapped.shouldSkip) {
        summary.skippedRows += 1;
        if (mapped.reason === 'missing_nik') {
          summary.rowsWithoutNik += 1;
        }
        continue;
      }

      summary.hadirFalseRows += mapped.quality.hadirFalseRows;
      summary.invalidFlagTrueRows += mapped.quality.invalidFlagTrueRows;
      summary.invalidVotedAtRows += mapped.quality.invalidVotedAtRows;
      summary.votingEligibleRows += mapped.quality.votingEligibleRows;
      summary.votingIneligibleRows += mapped.quality.votingIneligibleRows;

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
      updated_dukcapil: summary.updatedDukcapil,
      affected_dukcapil: summary.affectedDukcapil,
      inserted_dpt: summary.insertedDpt,
      updated_dpt: summary.updatedDpt,
      affected_dpt: summary.affectedDpt,
      inserted_voting: summary.insertedVoting,
      skipped_rows: summary.skippedRows,
      rows_without_nik: summary.rowsWithoutNik,
      hadir_false_rows: summary.hadirFalseRows,
      invalid_flag_true_rows: summary.invalidFlagTrueRows,
      invalid_voted_at_rows: summary.invalidVotedAtRows,
      voting_eligible_rows: summary.votingEligibleRows,
      voting_ineligible_rows: summary.votingIneligibleRows,
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
      updated_dukcapil: summary.updatedDukcapil,
      affected_dukcapil: summary.affectedDukcapil,
      inserted_dpt: summary.insertedDpt,
      updated_dpt: summary.updatedDpt,
      affected_dpt: summary.affectedDpt,
      inserted_voting: summary.insertedVoting,
      skipped_rows: summary.skippedRows,
      rows_without_nik: summary.rowsWithoutNik,
      hadir_false_rows: summary.hadirFalseRows,
      invalid_flag_true_rows: summary.invalidFlagTrueRows,
      invalid_voted_at_rows: summary.invalidVotedAtRows,
      voting_eligible_rows: summary.votingEligibleRows,
      voting_ineligible_rows: summary.votingIneligibleRows,
      error_rows: summary.errorRows + 1,
      error_message: error.message,
    });

    throw error;
  }
}

module.exports = {
  importVotersFromCsv,
};
