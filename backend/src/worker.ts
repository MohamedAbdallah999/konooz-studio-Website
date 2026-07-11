import { httpServerHandler } from 'cloudflare:node';
import { app } from './app.js';

app.listen(4000);
export default httpServerHandler({ port: 4000 });