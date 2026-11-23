import 'dotenv/config';
import './database/environment.js';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createRepository, createLocalRepository } from './database/repository.js';
import supabase from '../api/db-client.js';

const repository = supabase ? createRepository(supabase) : createLocalRepository();
const app = createApp(repository);

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// Serve static assets directly from public/
app.use(express.static(publicDir));

// Single Page Application: Fallback for all HTML requests to index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && req.accepts('html')) {
    return res.sendFile(`${publicDir}/index.html`);
  }
  next();
});

app.use((req, res) => res.status(404).json({ error: 'Resource not found.' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Fairshare listening on port ${port} (Local SQLite: fairshare.db)`));
