/**
 * sync-docs.js
 *
 * Skrip mirroring dokumentasi menu Standar V2 (.agents/menu-docs/) dan 4 dokumen fondasi global
 * ke portal dokumentasi SaaS Nuxt 3 (C:\Users\ASUS\Documents\Web Dev\improving\documentasi-projects).
 *
 * Penggunaan:
 *   node .agents/scripts/sync-docs.js --dry-run   (Simulasi aman tanpa menulis keluar workspace)
 *   node .agents/scripts/sync-docs.js             (Mirror nyata ke portal documentasi-projects)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDryRun = process.argv.includes('--dry-run');
const SOURCE_DIR = path.resolve(__dirname, '../menu-docs');
const TARGET_PROJECT_DIR = 'C:\\Users\\ASUS\\Documents\\Web Dev\\improving\\documentasi-projects\\content\\projects\\clip-content-rewards';
const MANIFEST_PATH = path.join(TARGET_PROJECT_DIR, 'manifest.json');

console.log('====================================================');
console.log(`Sinkronisasi Dokumentasi clip-content-rewards ${isDryRun ? '(DRY-RUN)' : '(LIVE)'}`);
console.log('====================================================');
console.log(`Sumber : ${SOURCE_DIR}`);
console.log(`Tujuan : ${TARGET_PROJECT_DIR}\n`);

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`[ERROR] Direktori sumber tidak ditemukan: ${SOURCE_DIR}`);
  process.exit(1);
}

if (!isDryRun && !fs.existsSync(TARGET_PROJECT_DIR)) {
  console.log(`[INIT] Membuat folder proyek di portal: ${TARGET_PROJECT_DIR}`);
  fs.mkdirSync(TARGET_PROJECT_DIR, { recursive: true });
}

function getMarkdownFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(getMarkdownFiles(filePath));
    } else if (file.endsWith('.md') && file !== 'TEMPLATE-MENU-DOC.md' && file !== 'README.md') {
      results.push(filePath);
    }
  });
  return results;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const meta = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > -1) {
      const key = line.slice(0, colonIndex).trim();
      let val = line.slice(colonIndex + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      meta[key] = val;
    }
  });
  return meta;
}

const mdFiles = getMarkdownFiles(SOURCE_DIR);
console.log(`Ditemukan ${mdFiles.length} berkas dokumentasi menu untuk disinkronkan:`);

const syncedMenus = [];
mdFiles.forEach((srcPath) => {
  const content = fs.readFileSync(srcPath, 'utf8');
  const meta = parseFrontmatter(content);
  const targetFileName = meta.id ? `${meta.id}.md` : path.basename(srcPath);
  const destPath = path.join(TARGET_PROJECT_DIR, targetFileName);

  if (!isDryRun) {
    fs.writeFileSync(destPath, content, 'utf8');
  }
  console.log(`  [${isDryRun ? 'DRY' : 'MIRROR'}] ${path.relative(SOURCE_DIR, srcPath)} -> ${targetFileName}`);

  syncedMenus.push({
    id: meta.id || path.basename(srcPath, '.md'),
    title: meta.title || meta.id || 'Modul Tanpa Judul',
    category: meta.category || 'Umum',
    route: meta.route || '',
    lead_developer: meta.lead_developer || 'AhmadArifff',
    status: meta.status || 'Planned',
    last_commit: meta.last_commit || 'HEAD',
    last_updated: meta.last_updated || new Date().toISOString().split('T')[0]
  });
});

console.log('\nMenyinkronkan 5 Berkas Fondasi Global:');

const GLOBAL_FOUNDATION_FILES = [
  {
    src: path.resolve(__dirname, '../rules/10-architecture.md'),
    destName: 'system-architecture.md',
    id: 'system-architecture',
    title: 'Standar Arsitektur Sistem (Nuxt 3 + Express TS + Local Queue)',
    category: '00-arsitektur-dan-knowledge'
  },
  {
    src: path.resolve(__dirname, '../knowledge/technical-blueprint-m3.md'),
    destName: 'technical-blueprint-m3.md',
    id: 'technical-blueprint-m3',
    title: 'Technical Blueprint M3 (Prisma Schema, Zod Contracts, API Map & Wireframes)',
    category: '00-arsitektur-dan-knowledge'
  },
  {
    src: path.resolve(__dirname, '../rules/50-video-ai-pipeline.md'),
    destName: 'video-ai-pipeline.md',
    id: 'video-ai-pipeline',
    title: 'Pipeline Video Lokal (EDL JSON, FFmpeg 8.1.2, Safe-Zone & Audio)',
    category: '00-arsitektur-dan-knowledge'
  },
  {
    src: path.resolve(__dirname, '../knowledge/bug-cases.md'),
    destName: 'production-bug-cases.md',
    id: 'production-bug-cases',
    title: 'Daftar Kasus Bug & Solusi Terverifikasi (Bug Knowledge Bank)',
    category: '00-arsitektur-dan-knowledge'
  },
  {
    src: path.resolve(__dirname, '../knowledge/cross-menu-disambiguation.md'),
    destName: 'cross-menu-disambiguation.md',
    id: 'cross-menu-disambiguation',
    title: 'Kamus Disambiguasi Fitur Kembar & Batas Konteks Lintas-Menu',
    category: '00-arsitektur-dan-knowledge'
  }
];

const syncedKnowledge = [];
GLOBAL_FOUNDATION_FILES.forEach((item) => {
  if (!fs.existsSync(item.src)) {
    console.warn(`  [WARN] Sumber tidak ditemukan: ${item.src}`);
    return;
  }

  let content = fs.readFileSync(item.src, 'utf8');
  if (!content.startsWith('---')) {
    const today = new Date().toISOString().split('T')[0];
    content = `---\nid: "${item.id}"\ntitle: "${item.title}"\ncategory: "${item.category}"\nroute: "N/A"\nlead_developer: "AhmadArifff"\nlast_updated: "${today}"\n---\n\n${content}`;
  }

  if (!isDryRun) {
    fs.writeFileSync(path.join(TARGET_PROJECT_DIR, item.destName), content, 'utf8');
  }
  console.log(`  [${isDryRun ? 'DRY' : 'FOUNDATION'}] ${path.basename(item.src)} -> ${item.destName}`);

  syncedKnowledge.push({
    id: item.id,
    title: item.title,
    category: item.category,
    filename: item.destName,
    last_updated: new Date().toISOString().split('T')[0]
  });
});

const defaultManifest = {
  id: 'clip-content-rewards',
  name: 'Clip Content Rewards Studio',
  description: 'AI Auto-Editor, Viral Scorer, Upload Playbook & Iterative Prompt Re-Editor lokal berbasis Nuxt 3, Express TS, BYOK AI, dan FFmpeg untuk TikTok & YouTube.',
  category: 'AI Media & Creator Tools',
  source_directory: path.resolve(__dirname, '../..'),
  lead_developers: ['AhmadArifff'],
  tech_stack: [
    'Nuxt 3 / Vue 3 (TypeScript)',
    'Express.js (TypeScript)',
    'SQLite (WAL) + Prisma ORM',
    'Local FFmpeg 8.1.2 + FFprobe',
    'BYOK AI Gateway (Gemini / OpenAI / Claude / Groq)'
  ],
  database_name: 'clip_content_rewards.db',
  is_private: true,
  created_at: '2026-11-26',
  menus: syncedMenus,
  system_knowledge: syncedKnowledge,
  last_synced_at: new Date().toISOString()
};

if (!isDryRun) {
  let manifest = defaultManifest;
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      manifest = {
        ...existing,
        menus: syncedMenus,
        system_knowledge: syncedKnowledge,
        last_synced_at: new Date().toISOString()
      };
    } catch (err) {
      console.warn(`[WARN] Gagal membaca manifest lama, membuat ulang: ${err.message}`);
    }
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n[MANIFEST] Tersimpan di ${MANIFEST_PATH}`);
} else {
  console.log(`\n[DRY-RUN] Manifest siap di-bootstrap dengan ${syncedMenus.length} menu & ${syncedKnowledge.length} fondasi.`);
}

console.log('\n====================================================');
console.log(`Selesai (${isDryRun ? 'Simulasi aman berhasil' : 'Sinkronisasi portal berhasil'}).`);
console.log('====================================================\n');
