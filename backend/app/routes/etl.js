const express = require('express');
const { QueryTypes, Op } = require('sequelize');
const { importVotersFromCsv } = require('../services/voterImportService');

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

function parseReviewStatus(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'accepted' || normalized === 'rejected') {
    return normalized;
  }

  return null;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function parseScore(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, parsed));
}

function canonicalizeText(value) {
  const normalized = normalizeOptionalText(value);

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

function buildAnalysisBlockKey(record) {
  const canonicalName = canonicalizeText(record.nama);
  const canonicalAddress = canonicalizeText(record.alamat);

  return {
    key: `${record.tanggal_lahir}|${canonicalName.slice(0, 8)}|${canonicalAddress.slice(0, 8)}`,
    canonicalName,
    canonicalAddress,
  };
}

function createEtlRouter(sequelize, models = {}) {
  if (!sequelize || typeof sequelize.query !== 'function') {
    throw new Error('A valid Sequelize instance is required to create the ETL router.');
  }

  const router = express.Router();

  router.post('/validate-voter', async (req, res, next) => {
    try {
      const limit = parsePositiveInt(req.body?.limit, 1000);
      const offset = parsePositiveInt(req.body?.offset, 0);

      const notVotedSql = `
        SELECT d.*
        FROM dpt AS d
        WHERE NOT EXISTS (
          SELECT 1
          FROM voting AS v
          WHERE v.nik = d.nik
        )
        ORDER BY d.nik
        LIMIT :limit OFFSET :offset;
      `;

      const countSql = `
        SELECT COUNT(*) AS total
        FROM dpt AS d
        WHERE NOT EXISTS (
          SELECT 1
          FROM voting AS v
          WHERE v.nik = d.nik
        );
      `;

      const [rows, countResult] = await Promise.all([
        sequelize.query(notVotedSql, {
          replacements: { limit, offset },
          type: QueryTypes.SELECT,
        }),
        sequelize.query(countSql, {
          type: QueryTypes.SELECT,
        }),
      ]);

      const total = Number(countResult?.[0]?.total ?? 0);

      return res.status(200).json({
        success: true,
        total,
        limit,
        offset,
        data: rows,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/import-voters', async (req, res, next) => {
    try {
      const batchSize = parsePositiveInt(req.body?.batchSize, 500);
      const filePath = req.body?.filePath;

      const result = await importVotersFromCsv({
        sequelize,
        EtlImportRun: models.EtlImportRun,
        EtlDuplicateCandidate: models.EtlDuplicateCandidate,
        filePath,
        batchSize,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/import-runs/summary', async (req, res, next) => {
    try {
      if (!models.EtlImportRun || typeof models.EtlImportRun.findAll !== 'function') {
        throw new Error('EtlImportRun model is required to retrieve import summaries.');
      }

      const requestedLimit = parsePositiveInt(req.query?.limit, 10);
      const limit = Math.min(Math.max(requestedLimit || 10, 1), 100);

      const runs = await models.EtlImportRun.findAll({
        order: [['id', 'DESC']],
        limit,
      });

      const plainRuns = runs.map((run) => run.get({ plain: true }));

      const aggregate = plainRuns.reduce(
        (accumulator, run) => {
          accumulator.totalRows += Number(run.total_rows || 0);
          accumulator.insertedDukcapil += Number(run.inserted_dukcapil || 0);
          accumulator.updatedDukcapil += Number(run.updated_dukcapil || 0);
          accumulator.affectedDukcapil += Number(run.affected_dukcapil || 0);
          accumulator.insertedDpt += Number(run.inserted_dpt || 0);
          accumulator.updatedDpt += Number(run.updated_dpt || 0);
          accumulator.affectedDpt += Number(run.affected_dpt || 0);
          accumulator.insertedVoting += Number(run.inserted_voting || 0);
          accumulator.skippedRows += Number(run.skipped_rows || 0);
          accumulator.rowsWithoutNik += Number(run.rows_without_nik || 0);
          accumulator.hadirFalseRows += Number(run.hadir_false_rows || 0);
          accumulator.invalidFlagTrueRows += Number(run.invalid_flag_true_rows || 0);
          accumulator.invalidVotedAtRows += Number(run.invalid_voted_at_rows || 0);
          accumulator.votingEligibleRows += Number(run.voting_eligible_rows || 0);
          accumulator.votingIneligibleRows += Number(run.voting_ineligible_rows || 0);
          accumulator.duplicateCandidates += Number(run.duplicate_candidates || 0);
          accumulator.errorRows += Number(run.error_rows || 0);
          return accumulator;
        },
        {
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
          duplicateCandidates: 0,
          errorRows: 0,
        }
      );

      const latestRun = plainRuns[0] || null;
      const latestTotalRows = latestRun
        ? Math.max(Number(latestRun.total_rows || 0), 0)
        : 0;

      return res.status(200).json({
        success: true,
        limit,
        totalRuns: plainRuns.length,
        latestRun,
        aggregate,
        latestRates: latestRun
          ? {
              votingEligibilityRate: latestTotalRows > 0
                ? Number(latestRun.voting_eligible_rows || 0) / latestTotalRows
                : 0,
              skippedRate: latestTotalRows > 0
                ? Number(latestRun.skipped_rows || 0) / latestTotalRows
                : 0,
              duplicateCandidateRate: latestTotalRows > 0
                ? Number(latestRun.duplicate_candidates || 0) / latestTotalRows
                : 0,
            }
          : null,
        runs: plainRuns,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/duplicate-candidates', async (req, res, next) => {
    try {
      if (!models.EtlDuplicateCandidate || typeof models.EtlDuplicateCandidate.findAll !== 'function') {
        throw new Error('EtlDuplicateCandidate model is required to retrieve duplicate candidates.');
      }

      const importRunId = parsePositiveInt(req.query?.importRunId, null);
      const requestedLimit = parsePositiveInt(req.query?.limit, 20);
      const limit = Math.min(Math.max(requestedLimit || 20, 1), 200);
      const offset = parsePositiveInt(req.query?.offset, 0);
      const minScore = Number.parseFloat(req.query?.minScore ?? '0.88');
      const normalizedMinScore = Number.isFinite(minScore) ? Math.max(Math.min(minScore, 1), 0) : 0.88;
      const reviewStatus = parseReviewStatus(req.query?.reviewStatus);

      const where = {
        similarity_score: {
          [Op.gte]: normalizedMinScore,
        },
      };

      if (importRunId !== null) {
        where.import_run_id = importRunId;
      }

      if (reviewStatus) {
        where.review_status = reviewStatus;
      }

      const { rows, count } = await models.EtlDuplicateCandidate.findAndCountAll({
        where,
        order: [
          ['similarity_score', 'DESC'],
          ['id', 'DESC'],
        ],
        limit,
        offset,
      });

      return res.status(200).json({
        success: true,
        total: count,
        limit,
        offset,
        minScore: normalizedMinScore,
        reviewStatus,
        data: rows,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/duplicate-candidates/summary', async (req, res, next) => {
    try {
      if (!models.EtlDuplicateCandidate || typeof models.EtlDuplicateCandidate.findAll !== 'function') {
        throw new Error('EtlDuplicateCandidate model is required to retrieve duplicate summary.');
      }

      const importRunId = parsePositiveInt(req.query?.importRunId, null);
      const where = {};

      if (importRunId !== null) {
        where.import_run_id = importRunId;
      }

      const rows = await models.EtlDuplicateCandidate.findAll({
        attributes: [
          'review_status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        ],
        where,
        group: ['review_status'],
        raw: true,
      });

      const counts = {
        pending: 0,
        accepted: 0,
        rejected: 0,
      };

      for (const row of rows) {
        const status = String(row.review_status || 'pending');
        counts[status] = Number(row.total || 0);
      }

      const total = counts.pending + counts.accepted + counts.rejected;

      return res.status(200).json({
        success: true,
        importRunId,
        total,
        counts,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/duplicate-candidates/analyze', async (req, res, next) => {
    try {
      const minScore = parseScore(req.query?.minScore, 0.75);
      const maxRows = Math.min(Math.max(parsePositiveInt(req.query?.maxRows, 3000) || 3000, 100), 15000);
      const limit = Math.min(Math.max(parsePositiveInt(req.query?.limit, 200) || 200, 1), 2000);

      const dukcapilRows = await sequelize.query(
        `
          SELECT nik, nama, tanggal_lahir, alamat
          FROM dukcapil
          WHERE tanggal_lahir IS NOT NULL
          ORDER BY nik
          LIMIT :maxRows;
        `,
        {
          replacements: { maxRows },
          type: QueryTypes.SELECT,
        }
      );

      const duplicateBuckets = new Map();
      const pairSignatureSet = new Set();
      const candidates = [];
      let comparedPairs = 0;

      for (const currentRecord of dukcapilRows) {
        const { key } = buildAnalysisBlockKey(currentRecord);
        const bucket = duplicateBuckets.get(key) || [];

        for (const previousRecord of bucket) {
          if (currentRecord.nik === previousRecord.nik) {
            continue;
          }

          const nameSimilarity = jaccardSimilarity(currentRecord.nama, previousRecord.nama);
          const addressSimilarity = jaccardSimilarity(currentRecord.alamat, previousRecord.alamat);
          const score = (nameSimilarity * 0.75) + (addressSimilarity * 0.25);
          comparedPairs += 1;

          if (score < minScore) {
            continue;
          }

          const orderedNik = [currentRecord.nik, previousRecord.nik].sort();
          const signature = `${orderedNik[0]}|${orderedNik[1]}`;

          if (pairSignatureSet.has(signature)) {
            continue;
          }

          pairSignatureSet.add(signature);
          candidates.push({
            sourceNik: currentRecord.nik,
            matchedNik: previousRecord.nik,
            sourceName: currentRecord.nama,
            matchedName: previousRecord.nama,
            sourceAddress: currentRecord.alamat,
            matchedAddress: previousRecord.alamat,
            similarityScore: Number(score.toFixed(4)),
            reason: `name_similarity=${nameSimilarity.toFixed(4)},address_similarity=${addressSimilarity.toFixed(4)},tanggal_lahir_match=${currentRecord.tanggal_lahir}`,
          });

          if (candidates.length >= limit) {
            break;
          }
        }

        bucket.push(currentRecord);
        duplicateBuckets.set(key, bucket);

        if (candidates.length >= limit) {
          break;
        }
      }

      return res.status(200).json({
        success: true,
        analysisMode: true,
        persisted: false,
        minScore,
        scannedRows: dukcapilRows.length,
        comparedPairs,
        returnedCandidates: candidates.length,
        data: candidates,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/duplicate-candidates/:id/review', async (req, res, next) => {
    try {
      if (!models.EtlDuplicateCandidate || typeof models.EtlDuplicateCandidate.findByPk !== 'function') {
        throw new Error('EtlDuplicateCandidate model is required to review duplicate candidates.');
      }

      const candidateId = parsePositiveInt(req.params?.id, null);
      const reviewStatus = parseReviewStatus(req.body?.reviewStatus);
      const reviewerNote = normalizeOptionalText(req.body?.reviewerNote);

      if (!candidateId) {
        return res.status(400).json({
          success: false,
          message: 'A valid candidate id is required.',
        });
      }

      if (!reviewStatus) {
        return res.status(400).json({
          success: false,
          message: 'reviewStatus must be one of: pending, accepted, rejected.',
        });
      }

      const candidate = await models.EtlDuplicateCandidate.findByPk(candidateId);

      if (!candidate) {
        return res.status(404).json({
          success: false,
          message: `Duplicate candidate with id ${candidateId} was not found.`,
        });
      }

      await candidate.update({
        review_status: reviewStatus,
        reviewer_note: reviewerNote,
        reviewed_at: reviewStatus === 'pending' ? null : new Date(),
      });

      return res.status(200).json({
        success: true,
        data: candidate,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createEtlRouter,
};
