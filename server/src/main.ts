// Lancement du serveur : node build/server.mjs (voir tools/run-server.mjs)
import { startServer } from './server';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.PORT ?? 8787);
const secret = process.env.KINGDOMS_SECRET ?? randomBytes(32).toString('hex');
if (!process.env.KINGDOMS_SECRET) console.warn('⚠ KINGDOMS_SECRET non défini : jetons de session temporaires.');
startServer({
  port, secret,
  dataDir: process.env.KINGDOMS_DATA ?? './server-data',
  devMode: process.env.NODE_ENV !== 'production',
  // En production : brancher ici l'appel à l'API Google Play Developer
  // (androidpublisher.purchases.products.get) avec un compte de service.
  verifyGooglePurchase: undefined,
});
console.log(`KINGDOMS serveur autoritaire sur :${port}`);
