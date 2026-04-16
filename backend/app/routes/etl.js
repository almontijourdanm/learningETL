const express = require('express');
const { QueryTypes } = require('sequelize');
const { importVotersFromCsv } = require('../services/voterImportService');

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
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
            }
          : null,
        runs: plainRuns,
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
