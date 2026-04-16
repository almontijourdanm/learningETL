const express = require('express');
const { QueryTypes } = require('sequelize');

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

function createEtlRouter(sequelize) {
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

  return router;
}

module.exports = {
  createEtlRouter,
};
