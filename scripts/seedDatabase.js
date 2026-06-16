import { connectDatabase, closeDatabase } from '../src/db.js';
import { seedDefaultSde } from '../src/services/catalog.js';

const reset = process.argv.includes('--reset');
await connectDatabase();
const summary = await seedDefaultSde({ reset });
console.log(JSON.stringify(summary, null, 2));
await closeDatabase();
