require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Web UI available at: http://localhost:${PORT}`);
  console.log(`API available at: http://localhost:${PORT}/api`);
});
