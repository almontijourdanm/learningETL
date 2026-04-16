const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'learning_etl',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: false,
  }
);

const Dukcapil = require('./dukcapil')(sequelize);
const Dpt = require('./dpt')(sequelize);
const Voting = require('./voting')(sequelize);
const EtlImportRun = require('./etlImportRun')(sequelize);

module.exports = {
  sequelize,
  Dukcapil,
  Dpt,
  Voting,
  EtlImportRun,
};