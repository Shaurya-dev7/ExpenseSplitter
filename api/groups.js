import '../src/database/environment.js';
import supabase from './db-client.js';
import { createApp } from '../src/app.js';
import { createRepository } from '../src/database/repository.js';
export default createApp(createRepository(supabase));
