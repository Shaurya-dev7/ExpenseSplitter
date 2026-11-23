import '../../src/database/environment.js';
import supabase from '../db-client.js';
import { createApp } from '../../src/app.js';
import { createRepository } from '../../src/database/repository.js';
import { createAccountRepository } from '../../src/database/account.repository.js';
import { createAccountService } from '../../src/services/account.service.js';
export default createApp(createRepository(supabase), createAccountService(createAccountRepository(supabase)));
