#!/usr/bin/env node
/**
 * Session State Manager CLI for clip-content-rewards
 *
 * Memeriksa dan menampilkan status sesi aktif, milestone selesai, dan constraint terkunci.
 * Penggunaan: node .agents/02-session-state/session-manager.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sessionFile = path.join(__dirname, 'active-session.json');

if (!fs.existsSync(sessionFile)) {
  console.error('[SessionManager] Error: active-session.json tidak ditemukan.');
  process.exit(1);
}

const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));

console.log('================================================================');
console.log('     SESSION STATE TRACKER - CLIP-CONTENT-REWARDS PROJECT       ');
console.log('================================================================');
console.log(`Session ID    : ${session.session_id}`);
console.log(`Project       : ${session.project} (${session.tagline})`);
console.log(`Active Branch : ${session.active_branch}`);
console.log(`Status        : ${session.status}`);
console.log(`Current Sprint: ${session.current_sprint}`);
console.log(`Active Goal   : ${session.active_goal}`);
console.log(`Last Updated  : ${session.last_updated}`);
console.log('----------------------------------------------------------------');

console.log('\n[Milestone Terselesaikan (Completed)]:');
if (Array.isArray(session.completed_milestones) && session.completed_milestones.length > 0) {
  session.completed_milestones.forEach((m, idx) => {
    console.log(`  ${idx + 1}. [${m.status}] ${m.title}`);
    console.log(`     Tgl: ${m.verified_at} | Detail: ${m.details.substring(0, 95)}...`);
  });
} else {
  console.log('  (Belum ada milestone selesai)');
}

console.log('\n[Milestone Berikutnya / Sedang Berjalan]:');
if (Array.isArray(session.in_progress_milestones) && session.in_progress_milestones.length > 0) {
  session.in_progress_milestones.forEach((m) => {
    console.log(`  * [${m.status}] ${m.title}`);
  });
} else {
  console.log('  (Tidak ada milestone aktif)');
}

console.log('\n[Batasan Arsitektur Terkunci (Established Constraints)]:');
if (Array.isArray(session.established_constraints) && session.established_constraints.length > 0) {
  session.established_constraints.forEach((c, idx) => {
    console.log(`  ${idx + 1}. ${c}`);
  });
}

console.log('\n[Langkah Kerja Selanjutnya (Next Steps)]:');
if (Array.isArray(session.next_actionable_steps) && session.next_actionable_steps.length > 0) {
  session.next_actionable_steps.forEach((s) => {
    console.log(`  -> ${s}`);
  });
}

console.log('\n================================================================');
console.log('               SINKRONISASI SESI TERVALIDASI                    ');
console.log('================================================================\n');
