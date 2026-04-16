const express = require('express');
const { sequelize } = require('./models');
const { createEtlRouter } = require('./routes/etl');

const app = express();

app.use(express.json());
app.use('/etl', createEtlRouter(sequelize));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
