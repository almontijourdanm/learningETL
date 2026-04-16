const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 1000;
const CANDIDATE_BATCH_SIZE = 200;
const FUZZY_SCORE_THRESHOLD = 0.88;
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

function canonicalizeText(value) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return '';
  }

  return normalized
    .toLowerCase()
    .replace(/\bjl\.?\b/g, 'jalan')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return new Set(canonicalizeText(value).split(' ').filter(Boolean));
}

function jaccardSimilarity(leftValue, rightValue) {
  const leftTokens = tokenize(leftValue);
  const rightTokens = tokenize(rightValue);

  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return 1;
  }

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersectionSize += 1;
    }
  }

  const unionSize = leftTokens.size + rightTokens.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

function buildDuplicateDetectionKey(dukcapilRecord) {
  const canonicalName = canonicalizeText(dukcapilRecord.nama);
  const canonicalAddress = canonicalizeText(dukcapilRecord.alamat);

  return {
    key: `${dukcapilRecord.tanggal_lahir || 'unknown'}|${canonicalName.slice(0, 8)}|${canonicalAddress.slice(0, 8)}`,
    canonicalName,
    canonicalAddress,
  };
}

function buildDuplicateCandidate(currentRecord, previousRecord, nameSimilarity, addressSimilarity) {
  const score = (nameSimilarity * 0.75) + (addressSimilarity * 0.25);

  if (score < FUZZY_SCORE_THRESHOLD) {
    return null;
  }

  return {
    source_nik: currentRecord.nik,
    matched_nik: previousRecord.nik,
    source_name: currentRecord.nama,
    matched_name: previousRecord.nama,
    source_address: currentRecord.alamat,
    matched_address: previousRecord.alamat,
    similarity_score: Number(score.toFixed(4)),
    match_reason: `name_similarity=${nameSimilarity.toFixed(4)},address_similarity=${addressSimilarity.toFixed(4)},tanggal_lahir_match=${currentRecord.tanggal_lahir || 'unknown'}`,
  };
}

function detectFuzzyCandidate(currentRecord, previousRecord) {
  if (!currentRecord || !previousRecord || currentRecord.nik === previousRecord.nik) {
    return null;
  }

  if (!currentRecord.tanggal_lahir || currentRecord.tanggal_lahir !== previousRecord.tanggal_lahir) {
    return null;
  }

  const nameSimilarity = jaccardSimilarity(currentRecord.nama, previousRecord.nama);
  const addressSimilarity = jaccardSimilarity(currentRecord.alamat, previousRecord.alamat);

  return buildDuplicateCandidate(currentRecord, previousRecord, nameSimilarity, addressSimilarity);
}

async function flushCandidateBatch(EtlDuplicateCandidate, candidateBatch) {
  if (!EtlDuplicateCandidate || candidateBatch.length === 0) {
    return;
  }

  await EtlDuplicateCandidate.bulkCreate(candidateBatch);
  candidateBatch.length = 0;
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

async function importVotersFromCsv({ sequelize, EtlImportRun, EtlDuplicateCandidate, filePath, batchSize = DEFAULT_BATCH_SIZE }) {
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
  const candidateBatch = [];
  const candidateSignatureSet = new Set();
  const duplicateBuckets = new Map();

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

      if (EtlDuplicateCandidate) {
        const currentRecord = mapped.dukcapil;
        const { key } = buildDuplicateDetectionKey(currentRecord);
        const bucket = duplicateBuckets.get(key) || [];

        for (const previousRecord of bucket) {
          const candidate = detectFuzzyCandidate(currentRecord, previousRecord);

          if (!candidate) {
            continue;
          }

          const orderedNik = [candidate.source_nik, candidate.matched_nik].sort();
          const signature = `${importRun.id}|${orderedNik[0]}|${orderedNik[1]}`;

          if (candidateSignatureSet.has(signature)) {
            continue;
          }

          candidateSignatureSet.add(signature);
          candidateBatch.push({
            import_run_id: importRun.id,
            ...candidate,
          });

          if (candidateBatch.length >= CANDIDATE_BATCH_SIZE) {
            await flushCandidateBatch(EtlDuplicateCandidate, candidateBatch);
          }
        }

        bucket.push(currentRecord);
        duplicateBuckets.set(key, bucket);
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
    await flushCandidateBatch(EtlDuplicateCandidate, candidateBatch);

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
      duplicate_candidates: candidateSignatureSet.size,
      error_rows: summary.errorRows,
    });

    return {
      ...summary,
      duplicateCandidates: candidateSignatureSet.size,
      status: 'success',
    };
  } catch (error) {
    await flushCandidateBatch(EtlDuplicateCandidate, candidateBatch);

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
      duplicate_candidates: candidateSignatureSet.size,
      error_rows: summary.errorRows + 1,
      error_message: error.message,
    });

    throw error;
  }
}

module.exports = {
  importVotersFromCsv,
};
