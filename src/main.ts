import { initDb } from './database';
import serviceAccount from './database/creds/nftc-dev-firebase-creds.json';

import { config as loadEnv } from 'dotenv';
import { startServices } from './services';
import { writer } from './writer';

// load environment vars
loadEnv();

// init db connection
initDb(serviceAccount);

main();

async function main() {
  await startServices(writer);
}
