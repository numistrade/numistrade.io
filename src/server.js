const { assertRuntimeConfig, config } = require("./config");

assertRuntimeConfig();

const { createApp } = require("./app");

const app = createApp();

app.listen(config.port, () => {
  console.log(`NumisTrade API listening on http://localhost:${config.port}`);
  console.log(`Database: ${config.dbPath}`);
});
