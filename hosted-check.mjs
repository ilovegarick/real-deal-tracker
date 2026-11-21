import { readFile, rename, writeFile } from 'node:fs/promises';
import { checkRequest } from './discovery.mjs';

const stateFile = '.tracker-state.json';
try {
  let previous = {};
  try {
    previous = JSON.parse(await readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const state = await checkRequest(process.argv[2] ?? process.env.TRACK_REQUEST ?? '', previous, {
    searchKey: process.env.SERPAPI_API_KEY,
    emailKey: process.env.RESEND_API_KEY,
    recipient: process.env.ALERT_EMAIL,
  });
  const temporary = stateFile + '.tmp';
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n');
  await rename(temporary, stateFile);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
