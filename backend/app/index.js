const express = require('express');
const models = require('./models');
const { createEtlRouter } = require('./routes/etl');

const app = express();

app.use(express.json());
app.use('/etl', createEtlRouter(models.sequelize, models));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
