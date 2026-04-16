require('dotenv').config();

const app = require('./app');

const port = Number.parseInt(process.env.PORT || '3000', 10);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is running on port ${port}`);
});
